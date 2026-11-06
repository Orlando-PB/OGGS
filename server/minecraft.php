<?php
// OGGS Minecraft world. The page names a Street View panorama. This fetches its tiles from
// Google, stitches them into one picture, sends that to OpenAI's image edit API (normal) or
// Google's Gemini API (hq) with the key it holds, and returns the redrawn picture. Runs on the
// IONOS webspace: ~/oggs is the web root, and secrets and the usage database live in ~/oggs_private.
//
//   GET  ?caps=1&client=<id>&code=<code>
//        -> { normal, hq, codeOk, log: { normal: [ms timestamps], hq: [...] } }
//   POST pano=<panorama id> worldWidth=<px> tileWidth=<px> mode=normal|hq
//        style=minecraft client=<id> code=<code>
//        -> { image: "data:image/jpeg;base64,...", usage, ms, log } or { error, code? }
//        code 'credit': the API account for that mode is out of credit (or rate limited), so it
//        is paused for PAUSE seconds and the page stops asking until then.
//
// What comes in: a panorama id (public, the same string Google's own tile URLs carry), the
// panorama's size, the mode, a random per-install client id and an optional code. No account
// details, no cookies, no location beyond what the panorama itself shows. What goes out: the
// generated JPEG plus the day's usage for that client id. The usage database keeps the time,
// client id, IP address, mode, and the API's error if it failed, for two days, for the daily
// limits only.
//
// Limits are per client id over a rolling 24 h, in the same shape as the page's own log so the
// two can be merged. Per-IP and global daily caps sit behind that, so fresh client ids can't run
// up the bill.
declare(strict_types=1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$private = dirname(__DIR__) . '/oggs_private';
$config = @include "$private/config.php";
if (!is_array($config) || empty($config['OPENAI_API_KEY']) || empty($config['GEMINI_API_KEY'])) {
  fail(500, 'Server not set up');
}

// Normal: OpenAI flare at low with a 1024 px input (the fewest input tokens it charges), about
// $0.009 a round in ~13 s. HQ: Gemini Nano Banana 2.1 at 2K, about $0.055 in ~23 s. Gemini has
// no 2:1 shape, so the panorama goes in squashed to 16:9 (`inputHeight`) and the 2752x1536
// result is stretched back to 3072x1536.
const MODES = [
  'normal' => [
    'api' => 'openai', 'model' => 'gpt-image-2.5-flare', 'quality' => 'low',
    'size' => '2048x1024', 'input' => 1024,
  ],
  'hq' => [
    'api' => 'gemini', 'model' => 'gemini-nano-banana-2.1', 'size' => '2K', 'aspect' => '16:9',
    'input' => 1024, 'inputHeight' => 576,
  ],
];
// per client, per rolling 24 h
const CAPS = ['normal' => 100, 'hq' => 10];
// With the code the limit is a spend instead: CODE_BUDGET a day per client at these rough
// per-round costs (USD), under a ceiling per mode so a bad estimate can't run away.
const COST = ['normal' => 0.009, 'hq' => 0.055];
const CODE_BUDGET = 6.5;
const CODE_CAPS = ['normal' => 800, 'hq' => 70];
// per IP address
const IP_CAPS = ['normal' => 900, 'hq' => 100];
// everyone together
const GLOBAL_CAPS = ['normal' => 1500, 'hq' => 200];
const DAY = 86400;
// after the API says the account is out of credit or over its rate limit
const PAUSE = 900;
const NO_CREDIT = "Can't be used right now, try again later";
// tile zoom to stitch: 2048x1024 on Gen 4, a bit less on older coverage
const ZOOM = 2;
const MAX_TILES = 64;
const TILE_HOSTS = [
  'https://streetviewpixels-pa.googleapis.com/v1/tile'
    . '?cb_client=apiv3&nbt=1&fover=2&panoid=%s&x=%d&y=%d&zoom=%d',
  'https://cbk0.google.com/cbk?output=tile&panoid=%s&x=%d&y=%d&zoom=%d',
];
const PROMPTS = [
  'minecraft' => 'Redraw this equirectangular 360° panorama as an in-game screenshot from Minecraft. '
    . 'Everything is built from whole blocks on one strict cubic grid, all the same size, with clean hard '
    . 'edges; the only exceptions are stairs, slabs, fences, doors, trapdoors and glass panes. No curves, no '
    . 'slopes, no tilted or half-merged blocks, and nothing at a finer scale than one block. Use the default '
    . '16x16 pixel textures exactly as they look in the game: sharp pixels, no blur, no smoothing, no '
    . 'painterly detail; block faces are flat with the normal Minecraft lighting. Feel free to use blocks '
    . 'from the newer updates and the level of detail and style of really impressive builds; it does not '
    . 'need to look bare-bones or like old Minecraft. Keep the same layout and camera, still equirectangular '
    . 'edge to edge. Simplify the scene where needed so every block reads clearly.',
];

function promptFor(): string {
  return PROMPTS['minecraft'];
}

function fail(int $status, string $msg, ?string $code = null): never {
  http_response_code($status);
  echo json_encode(['error' => $msg] + ($code ? ['code' => $code] : []));
  exit;
}

$client = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_REQUEST['client'] ?? ''));
if (strlen($client) < 8 || strlen($client) > 64) fail(400, 'Bad client id');
$code = trim((string)($_REQUEST['code'] ?? ''));
$codeOk = $code !== '' && !empty($config['HQ_CODE']) && hash_equals((string)$config['HQ_CODE'], $code);
$ip = $_SERVER['REMOTE_ADDR'] ?? '?';

// ---- usage database ----
$db = new PDO("sqlite:$private/usage.sqlite");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS usage_log (t INTEGER NOT NULL, client TEXT NOT NULL, '
  . 'ip TEXT NOT NULL, mode TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1)');
$db->exec('CREATE INDEX IF NOT EXISTS usage_t ON usage_log(t)');
$cols = array_column($db->query('PRAGMA table_info(usage_log)')->fetchAll(), 'name');
if (!in_array('err', $cols, true)) $db->exec('ALTER TABLE usage_log ADD COLUMN err TEXT');
$db->exec('DELETE FROM usage_log WHERE t < ' . (time() - 2 * DAY));

function logFor(PDO $db, string $client): array {
  $out = ['normal' => [], 'hq' => []];
  $q = $db->prepare('SELECT t, mode FROM usage_log WHERE client = ? AND ok = 1 AND t > ? ORDER BY t');
  $q->execute([$client, time() - DAY]);
  // ms, like Date.now()
  foreach ($q as $r) $out[$r['mode']][] = (int)$r['t'] * 1000;
  return $out;
}
function countWhere(PDO $db, string $where, array $args): int {
  $q = $db->prepare("SELECT COUNT(*) FROM usage_log WHERE ok = 1 AND t > ? AND $where");
  $q->execute([time() - DAY, ...$args]);
  return (int)$q->fetchColumn();
}

// The page works out what's left as cap minus its count. So with the code, each mode's cap is
// "used so far plus what the remaining budget buys", never above the ceiling.
$used = [
  'normal' => countWhere($db, 'client = ? AND mode = ?', [$client, 'normal']),
  'hq' => countWhere($db, 'client = ? AND mode = ?', [$client, 'hq']),
];
$spent = $used['normal'] * COST['normal'] + $used['hq'] * COST['hq'];
$caps = [];
foreach (['normal', 'hq'] as $m) {
  $affordable = (int)floor(max(0, CODE_BUDGET - $spent) / COST[$m]);
  $caps[$m] = $codeOk ? min(CODE_CAPS[$m], $used[$m] + $affordable) : CAPS[$m];
}

if (isset($_GET['caps']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode($caps + ['codeOk' => $codeOk, 'log' => logFor($db, $client)]);
  exit;
}

// ---- generate ----
$mode = (string)($_POST['mode'] ?? 'normal');
if (!isset(MODES[$mode])) fail(400, 'Unknown mode');
$style = (string)($_POST['style'] ?? 'minecraft');
if ($style !== 'minecraft') fail(400, 'Unknown style');
$pano = (string)($_POST['pano'] ?? '');
if (!preg_match('/^[A-Za-z0-9_=-]{8,128}$/', $pano)) fail(400, 'Bad panorama id');
$worldWidth = (int)($_POST['worldWidth'] ?? 0);
$tileWidth = (int)($_POST['tileWidth'] ?? 0);
if ($tileWidth < 128 || $tileWidth > 2048 || $worldWidth < $tileWidth || $worldWidth > 65536) {
  fail(400, 'Bad panorama size');
}

if ($used[$mode] >= $caps[$mode]) fail(429, 'Limit reached for today');
if (countWhere($db, 'ip = ? AND mode = ?', [$ip, $mode]) >= IP_CAPS[$mode]) {
  fail(429, 'Limit reached for today');
}
if (countWhere($db, 'mode = ?', [$mode]) >= GLOBAL_CAPS[$mode]) {
  fail(503, 'Fully booked today, try again tomorrow');
}

// A mode whose API account ran dry stays off for a while, without stitching or calling it.
$pauseFile = "$private/paused-$mode";
if ((int)@file_get_contents($pauseFile) > time()) fail(503, NO_CREDIT, 'credit');

set_time_limit(300);
$t0 = microtime(true);
$m = MODES[$mode];
$jpeg = stitch($pano, $worldWidth, $tileWidth, $m['input'], $m['inputHeight'] ?? 0);

// counted before the call; marked failed (and so not counted) if the API says no
$ins = $db->prepare('INSERT INTO usage_log (t, client, ip, mode) VALUES (?, ?, ?, ?)');
$ins->execute([time(), $client, $ip, $mode]);
$rowId = (int)$db->lastInsertId();

[$b64, $usage, $err, $noCredit] = $m['api'] === 'gemini'
  ? viaGemini($m, $jpeg, $config['GEMINI_API_KEY'])
  : viaOpenAI($m, $jpeg, $config['OPENAI_API_KEY']);
@unlink($jpeg);
if (!$b64) {
  // the reason stays in the log for the owner; the player only sees "not available"
  $db->prepare('UPDATE usage_log SET ok = 0, err = ? WHERE rowid = ?')
    ->execute([substr($err, 0, 300), $rowId]);
  error_log("oggs $style: $err");
  if ($noCredit) {
    file_put_contents($pauseFile, (string)(time() + PAUSE));
    fail(503, NO_CREDIT, 'credit');
  }
  fail(502, 'Not available right now, try again later');
}
echo json_encode([
  'image' => 'data:image/jpeg;base64,' . $b64,
  'usage' => $usage,
  'ms' => (int)round((microtime(true) - $t0) * 1000),
  'log' => logFor($db, $client),
]);

// ---- image APIs ----
// Each returns [base64 JPEG or null, the API's usage report, error text, out of credit?].
// Out of credit is HTTP 402/429 or OpenAI's quota codes: billing, not a bad picture.
function noCredit(int $status, ?array $j): bool {
  $code = $j['error']['code'] ?? $j['error']['type'] ?? '';
  return $status === 402 || $status === 429
    || in_array($code, ['insufficient_quota', 'billing_hard_limit_reached', 'RESOURCE_EXHAUSTED'], true);
}
function viaOpenAI(array $m, string $jpeg, string $key): array {
  $ch = curl_init('https://api.openai.com/v1/images/edits');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 280,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key],
    CURLOPT_POSTFIELDS => [
      'model' => $m['model'],
      'prompt' => promptFor(),
      'size' => $m['size'],
      'quality' => $m['quality'],
      'n' => '1',
      'output_format' => 'jpeg',
      'image' => new CURLFile($jpeg, 'image/jpeg', 'pano.jpg'),
    ],
  ]);
  $body = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $j = is_string($body) ? json_decode($body, true) : null;
  $b64 = $status === 200 ? ($j['data'][0]['b64_json'] ?? null) : null;
  $err = $j['error']['message'] ?? (curl_error($ch) ?: "OpenAI HTTP $status");
  return [$b64, $j['usage'] ?? null, $err, !$b64 && noCredit($status, $j)];
}

// Gemini answers at 16:9. The picture is stretched back to 2:1 here, so the page gets the same
// shape from both APIs.
function viaGemini(array $m, string $jpeg, string $key): array {
  $req = [
    'contents' => [['parts' => [
      ['text' => promptFor()],
      ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => base64_encode(file_get_contents($jpeg))]],
    ]]],
    'generationConfig' => [
      'responseModalities' => ['IMAGE'],
      'imageConfig' => ['aspectRatio' => $m['aspect'], 'imageSize' => $m['size']],
    ],
  ];
  $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$m['model']}:generateContent");
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 280,
    CURLOPT_HTTPHEADER => ['x-goog-api-key: ' . $key, 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($req),
  ]);
  $body = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $j = is_string($body) ? json_decode($body, true) : null;
  $data = null;
  foreach ($j['candidates'][0]['content']['parts'] ?? [] as $part) {
    $data ??= $part['inlineData']['data'] ?? null;
  }
  $noImage = 'Gemini gave no image (' . ($j['candidates'][0]['finishReason'] ?? "HTTP $status") . ')';
  $err = $j['error']['message'] ?? (curl_error($ch) ?: ($data ? '' : $noImage));
  if ($status !== 200 || !$data) return [null, null, $err, noCredit($status, $j)];
  $img = @imagecreatefromstring(base64_decode($data));
  if (!$img) return [null, null, 'Gemini image would not decode', false];
  $h = imagesy($img);
  $out = imagecreatetruecolor(2 * $h, $h);
  imagecopyresampled($out, $img, 0, 0, 0, 0, 2 * $h, $h, imagesx($img), $h);
  ob_start();
  imagejpeg($out, null, 90);
  return [base64_encode(ob_get_clean()), $j['usageMetadata'] ?? null, '', false];
}

// ---- stitching ----
// Fetches every tile of the panorama at ZOOM (trying each host in TILE_HOSTS) and lays them out
// on one canvas. If $inputWidth is set, shrinks it to that width and $inputHeight high (else half
// the width). Writes a JPEG to a temp file and returns its path.
function stitch(string $pano, int $worldWidth, int $tileWidth, int $inputWidth, int $inputHeight = 0): string {
  $zmax = (int)ceil(log($worldWidth / $tileWidth, 2));
  $zoom = min(ZOOM, $zmax);
  $W = (int)ceil($worldWidth / 2 ** ($zmax - $zoom));
  $H = (int)ceil($W / 2);
  $cols = (int)ceil($W / $tileWidth);
  $rows = (int)ceil($H / $tileWidth);
  if ($cols * $rows > MAX_TILES) fail(400, 'Panorama too large');

  $tiles = fetchTiles($pano, $zoom, $cols, $rows);
  $canvas = imagecreatetruecolor($W, $H);
  foreach ($tiles as [$x, $y, $data]) {
    $img = @imagecreatefromstring($data);
    if (!$img) fail(502, 'Bad tile from Street View');
    imagecopy($canvas, $img, $x * $tileWidth, $y * $tileWidth, 0, 0, imagesx($img), imagesy($img));
  }
  $inputHeight = $inputHeight ?: intdiv($inputWidth, 2);
  if ($inputWidth && ($W > $inputWidth || $H !== $inputHeight)) {
    $small = imagecreatetruecolor($inputWidth, $inputHeight);
    imagecopyresampled($small, $canvas, 0, 0, 0, 0, $inputWidth, $inputHeight, $W, $H);
    $canvas = $small;
  }
  $file = tempnam(sys_get_temp_dir(), 'oggs');
  imagejpeg($canvas, $file, 90);
  return $file;
}

// All tiles in parallel. A tile the first host won't give is retried on the next.
function fetchTiles(string $pano, int $zoom, int $cols, int $rows): array {
  $want = [];
  for ($y = 0; $y < $rows; $y++) {
    for ($x = 0; $x < $cols; $x++) $want[] = [$x, $y];
  }
  $got = [];
  foreach (TILE_HOSTS as $host) {
    if (!$want) break;
    $multi = curl_multi_init();
    $handles = [];
    foreach ($want as $i => [$x, $y]) {
      $ch = curl_init(sprintf($host, rawurlencode($pano), $x, $y, $zoom));
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => true,
      ]);
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
      $ok = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200 && $data !== '' && $data !== false;
      if ($ok) $got[] = [...$want[$i], $data];
      else $left[] = $want[$i];
      curl_multi_remove_handle($multi, $ch);
    }
    curl_multi_close($multi);
    $want = $left;
  }
  if ($want) fail(502, "Couldn't fetch this panorama");
  return $got;
}
