<?php
// OGGS Minecraft world. The page names a Street View panorama; this fetches its tiles from
// Google, stitches them into one picture, sends that to OpenAI's image edit API with the
// key it holds, and returns the redrawn picture. Runs on the IONOS webspace (~/oggs is the
// web root; secrets and the usage database live in ~/oggs_private).
//
//   GET  ?caps=1&client=<id>&code=<code>
//        -> { normal, hq, codeOk, log: { normal: [ms timestamps], hq: [...] } }
//   POST pano=<panorama id> worldWidth=<px> tileWidth=<px> mode=normal|hq client=<id> code=<code>
//        -> { image: "data:image/jpeg;base64,...", usage, ms, log } or { error }
//
// What comes in: a panorama id (public; the same string Google's own tile URLs carry), the
// panorama's size, the mode, a random per-install client id and an optional code. No
// account details, no cookies, no location beyond what the panorama itself shows. What goes
// out: the generated JPEG plus the day's usage count for that client id. The usage database
// keeps (time, client id, IP address, mode) for two days, for the daily limits only.
//
// Limits are per client id over a rolling 24 h, same shape as the page's own log so both
// sides can merge them. Per-IP and global daily caps sit behind that so fresh client ids
// can't run up the bill.
declare(strict_types=1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$private = dirname(__DIR__) . '/oggs_private';
$config = @include "$private/config.php";
if (!is_array($config) || empty($config['OPENAI_API_KEY'])) fail(500, 'server not configured');

// Normal: flare at low with a 1024 px input, about $0.008 a round. HQ: sunburst at high and
// the largest size, about $0.09.
const MODES = [
  'normal' => ['model' => 'gpt-image-2.5-flare', 'quality' => 'low', 'size' => '2048x1024', 'input' => 1024],
  'hq' => ['model' => 'gpt-image-2.5-sunburst', 'quality' => 'high', 'size' => '3840x1920', 'input' => 0], // 0: as stitched
];
const CAPS = ['normal' => 100, 'hq' => 10, 'hqWithCode' => 50]; // per client, per rolling 24 h
const IP_CAPS = ['normal' => 200, 'hq' => 60];                    // per IP address
const GLOBAL_CAPS = ['normal' => 1000, 'hq' => 150];              // everyone together
const DAY = 86400;
const ZOOM = 2;      // tile zoom to stitch: 2048x1024 on Gen 4, a bit less on older coverage
const MAX_TILES = 64;
const TILE_HOSTS = [
  'https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=apiv3&nbt=1&fover=2&panoid=%s&x=%d&y=%d&zoom=%d',
  'https://cbk0.google.com/cbk?output=tile&panoid=%s&x=%d&y=%d&zoom=%d',
];
const PROMPT = 'Redraw this equirectangular 360° panorama as an in-game screenshot from Minecraft. '
  . 'Everything is built from whole blocks on one strict cubic grid, all the same size, with clean hard edges; the only '
  . 'exceptions are stairs, slabs, fences, doors, trapdoors and glass panes. No curves, no slopes, no tilted or '
  . 'half-merged blocks, and nothing at a finer scale than one block. Use the default 16x16 pixel textures exactly as '
  . 'they look in the game: sharp pixels, no blur, no smoothing, no painterly detail; block faces are flat with the '
  . 'normal Minecraft lighting. Feel free to use blocks from the newer updates and the level of detail and style of '
  . 'really impressive builds; it does not need to look bare-bones or like old Minecraft. Keep the same layout and '
  . 'camera, still equirectangular edge to edge. Simplify the scene where needed so every block reads clearly.';

function fail(int $status, string $msg): never {
  http_response_code($status);
  echo json_encode(['error' => $msg]);
  exit;
}

$client = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_REQUEST['client'] ?? ''));
if (strlen($client) < 8 || strlen($client) > 64) fail(400, 'bad client id');
$code = trim((string)($_REQUEST['code'] ?? ''));
$codeOk = $code !== '' && !empty($config['HQ_CODE']) && hash_equals((string)$config['HQ_CODE'], $code);
$caps = ['normal' => CAPS['normal'], 'hq' => $codeOk ? CAPS['hqWithCode'] : CAPS['hq']];
$ip = $_SERVER['REMOTE_ADDR'] ?? '?';

// ---- usage database ----
$db = new PDO("sqlite:$private/usage.sqlite");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS usage_log (t INTEGER NOT NULL, client TEXT NOT NULL, ip TEXT NOT NULL, mode TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1)');
$db->exec('CREATE INDEX IF NOT EXISTS usage_t ON usage_log(t)');
$db->exec('DELETE FROM usage_log WHERE t < ' . (time() - 2 * DAY));

function logFor(PDO $db, string $client): array {
  $out = ['normal' => [], 'hq' => []];
  $q = $db->prepare('SELECT t, mode FROM usage_log WHERE client = ? AND ok = 1 AND t > ? ORDER BY t');
  $q->execute([$client, time() - DAY]);
  foreach ($q as $r) $out[$r['mode']][] = (int)$r['t'] * 1000; // ms, like Date.now()
  return $out;
}
function countWhere(PDO $db, string $where, array $args): int {
  $q = $db->prepare("SELECT COUNT(*) FROM usage_log WHERE ok = 1 AND t > ? AND $where");
  $q->execute([time() - DAY, ...$args]);
  return (int)$q->fetchColumn();
}

if (isset($_GET['caps']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode($caps + ['codeOk' => $codeOk, 'log' => logFor($db, $client)]);
  exit;
}

// ---- generate ----
$mode = (string)($_POST['mode'] ?? 'normal');
if (!isset(MODES[$mode])) fail(400, 'unknown mode');
$pano = (string)($_POST['pano'] ?? '');
if (!preg_match('/^[A-Za-z0-9_=-]{8,128}$/', $pano)) fail(400, 'bad panorama id');
$worldWidth = (int)($_POST['worldWidth'] ?? 0);
$tileWidth = (int)($_POST['tileWidth'] ?? 0);
if ($tileWidth < 128 || $tileWidth > 2048 || $worldWidth < $tileWidth || $worldWidth > 65536) fail(400, 'bad panorama size');

if (countWhere($db, 'client = ? AND mode = ?', [$client, $mode]) >= $caps[$mode]) fail(429, 'limit reached for today');
if (countWhere($db, 'ip = ? AND mode = ?', [$ip, $mode]) >= IP_CAPS[$mode]) fail(429, 'limit reached for today');
if (countWhere($db, 'mode = ?', [$mode]) >= GLOBAL_CAPS[$mode]) fail(503, 'Minecraft is fully booked today, try again tomorrow');

set_time_limit(300);
$t0 = microtime(true);
$m = MODES[$mode];
$jpeg = stitch($pano, $worldWidth, $tileWidth, $m['input']);

// counted before the call; marked failed (and so not counted) if OpenAI says no
$ins = $db->prepare('INSERT INTO usage_log (t, client, ip, mode) VALUES (?, ?, ?, ?)');
$ins->execute([time(), $client, $ip, $mode]);
$rowId = (int)$db->lastInsertId();

$ch = curl_init('https://api.openai.com/v1/images/edits');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 280,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $config['OPENAI_API_KEY']],
  CURLOPT_POSTFIELDS => [
    'model' => $m['model'], 'prompt' => PROMPT, 'size' => $m['size'], 'quality' => $m['quality'],
    'n' => '1', 'output_format' => 'jpeg',
    'image' => new CURLFile($jpeg, 'image/jpeg', 'pano.jpg'),
  ],
]);
$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlErr = curl_error($ch);
@unlink($jpeg);
$j = is_string($body) ? json_decode($body, true) : null;
$b64 = $j['data'][0]['b64_json'] ?? null;
if ($status !== 200 || !$b64) {
  $db->prepare('UPDATE usage_log SET ok = 0 WHERE rowid = ?')->execute([$rowId]);
  $msg = $j['error']['message'] ?? ($curlErr ?: "OpenAI HTTP $status");
  error_log("oggs minecraft: $msg");
  fail(502, 'Minecraft isn\'t available right now, try again later');
}
echo json_encode([
  'image' => 'data:image/jpeg;base64,' . $b64,
  'usage' => $j['usage'] ?? null,
  'ms' => (int)round((microtime(true) - $t0) * 1000),
  'log' => logFor($db, $client),
]);

// ---- stitching ----
// Fetches every tile of the panorama at ZOOM (trying each host in TILE_HOSTS), lays them
// out on one canvas, shrinks it to $inputWidth px wide if that's set, and writes a JPEG to
// a temp file whose path is returned.
function stitch(string $pano, int $worldWidth, int $tileWidth, int $inputWidth): string {
  $zmax = (int)ceil(log($worldWidth / $tileWidth, 2));
  $zoom = min(ZOOM, $zmax);
  $W = (int)ceil($worldWidth / 2 ** ($zmax - $zoom));
  $H = (int)ceil($W / 2);
  $cols = (int)ceil($W / $tileWidth);
  $rows = (int)ceil($H / $tileWidth);
  if ($cols * $rows > MAX_TILES) fail(400, 'panorama too large');

  $tiles = fetchTiles($pano, $zoom, $cols, $rows);
  $canvas = imagecreatetruecolor($W, $H);
  foreach ($tiles as [$x, $y, $data]) {
    $img = @imagecreatefromstring($data);
    if (!$img) fail(502, 'bad tile from Street View');
    imagecopy($canvas, $img, $x * $tileWidth, $y * $tileWidth, 0, 0, imagesx($img), imagesy($img));
  }
  if ($inputWidth && $W > $inputWidth) {
    $small = imagecreatetruecolor($inputWidth, intdiv($inputWidth, 2));
    imagecopyresampled($small, $canvas, 0, 0, 0, 0, $inputWidth, intdiv($inputWidth, 2), $W, $H);
    $canvas = $small;
  }
  $file = tempnam(sys_get_temp_dir(), 'oggs');
  imagejpeg($canvas, $file, 90);
  return $file;
}

// All tiles in parallel; a tile the first host won't give is retried on the next.
function fetchTiles(string $pano, int $zoom, int $cols, int $rows): array {
  $want = [];
  for ($y = 0; $y < $rows; $y++) for ($x = 0; $x < $cols; $x++) $want[] = [$x, $y];
  $got = [];
  foreach (TILE_HOSTS as $host) {
    if (!$want) break;
    $multi = curl_multi_init();
    $handles = [];
    foreach ($want as $i => [$x, $y]) {
      $ch = curl_init(sprintf($host, rawurlencode($pano), $x, $y, $zoom));
      curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => true]);
      curl_multi_add_handle($multi, $ch);
      $handles[$i] = $ch;
    }
    do {
      $status = curl_multi_exec($multi, $running);
      if ($running) curl_multi_select($multi, 1);
    } while ($running && $status === CURLM_OK);
    $left = [];
    foreach ($handles as $i => $ch) {
      $data = curl_multi_getcontent($ch);
      if (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200 && $data !== '' && $data !== false) $got[] = [...$want[$i], $data];
      else $left[] = $want[$i];
      curl_multi_remove_handle($multi, $ch);
    }
    curl_multi_close($multi);
    $want = $left;
  }
  if ($want) fail(502, 'could not fetch the panorama');
  return $got;
}
