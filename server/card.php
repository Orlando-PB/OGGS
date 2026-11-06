<?php
// OGGS live stats card: a PNG for the OGGS tile on orlandopb.com/fun. Shows downloads (the
// stores' public user counts), how many countries OGGS is used in, and how many are playing now.
//
// The counts come from the store listings and from the access log IONOS already keeps for this
// domain (~/logs, IPs already truncated by IONOS). Only requests from geoguessr.com count: OGGS
// 2.0+ calls ping.php every few minutes while GeoGuessr is open, and older versions reach this
// server only for the Minecraft world and the userscript's boards, so before 2.0 the country and
// playing-now numbers only see those players.
//
// ~/oggs_private/stats.sqlite keeps time, kind and country per request: no IP, client id or user
// agent. Each row's id (which stops a log line being counted twice) is a hash salted with a
// salt for that day, and the salts are deleted after SALT_KEEP, so old ids can't be traced back
// to a network. Pings keep one row per network per day. "Playing now" is counted from the log
// on each rebuild and not stored. Countries come from the iptoasn.com
// ip2country table (public domain), refreshed monthly.
//
// The card is rebuilt at most every REFRESH seconds; in between the last PNG is served as is.
declare(strict_types=1);

const REFRESH = 60;
const LIVE_WINDOW = 300; // "playing now": seen in the last 5 min (2.0 pings every 2)
const STORE_REFRESH = 6 * 3600;
const GEO_REFRESH = 30 * 86400;
const GEO_RETRY = 86400; // after a failed download of the country table
const SALT_KEEP = 3 * 86400;
const DOMAIN = 'oggs.orlandopb.com';
const CHROME_URL = 'https://chromewebstore.google.com/detail/oggs-orlandos-geoguessr-s/lbnadihehgfemijnjmabooamfnppkkpa';
const FIREFOX_API = 'https://addons.mozilla.org/api/v5/addons/addon/oggs/';
const EDGE_API = 'https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/';
const FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'];

$home = getenv('OGGS_HOME') ?: dirname(__DIR__);
$private = "$home/oggs_private";
$png = "$private/card.png";

if (!is_file($png) || time() - filemtime($png) >= REFRESH) {
  // One rebuild at a time; anyone else gets the previous card.
  $lock = fopen("$private/card.lock", 'c');
  if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
    set_time_limit(120);
    try {
      $db = openDb("$private/stats.sqlite");
      $cfg = @include "$private/config.php";
      refreshGeo($db);
      $live = ingestLogs($db, "$home/logs");
      refreshStores($db, is_array($cfg) ? (string)($cfg['EDGE_ID'] ?? '') : '');
      file_put_contents("$png.tmp", drawCard(readStats($db) + ['live' => $live]));
      rename("$png.tmp", $png);
    } catch (Throwable $e) {
      error_log('card.php: ' . $e->getMessage());
      touch($png); // back off for REFRESH instead of retrying on every request
    }
    flock($lock, LOCK_UN);
  }
}

if (PHP_SAPI === 'cli') exit;
header('Content-Type: image/png');
header('Cache-Control: public, max-age=60');
header('Access-Control-Allow-Origin: *');
readfile($png);

function openDb(string $path): PDO {
  $db = new PDO("sqlite:$path");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->exec('PRAGMA journal_mode=WAL');
  $db->exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, t INTEGER NOT NULL, '
    . 'kind TEXT NOT NULL, cc TEXT NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS logs_done (name TEXT PRIMARY KEY)');
  $db->exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS geo4 (start INTEGER PRIMARY KEY, stop INTEGER NOT NULL, cc TEXT NOT NULL)');
  $db->exec('CREATE TABLE IF NOT EXISTS geo6 (start TEXT PRIMARY KEY, stop TEXT NOT NULL, cc TEXT NOT NULL)');
  return $db;
}

function kvGet(PDO $db, string $k): ?array {
  $q = $db->prepare('SELECT v, t FROM kv WHERE k = ?');
  $q->execute([$k]);
  $r = $q->fetch(PDO::FETCH_ASSOC);
  return $r ? ['v' => $r['v'], 't' => (int)$r['t']] : null;
}

function kvSet(PDO $db, string $k, string $v): void {
  $db->prepare('INSERT OR REPLACE INTO kv (k, v, t) VALUES (?, ?, ?)')->execute([$k, $v, time()]);
}

function fetchUrl(string $url): ?string {
  $ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: Mozilla/5.0 (OGGS stats card)\r\nAccept-Language: en\r\n"]]);
  $body = @file_get_contents($url, false, $ctx);
  return $body === false ? null : $body;
}

// ---- country table ----

function refreshGeo(PDO $db): void {
  $done = kvGet($db, 'geo');
  if ($done && time() - $done['t'] < GEO_REFRESH) return;
  // noted before trying, so a failing download is retried once a day, not on every rebuild
  $tried = kvGet($db, 'geo_try');
  if ($tried && time() - $tried['t'] < GEO_RETRY) return;
  kvSet($db, 'geo_try', '');
  foreach (['4' => 'geo4', '6' => 'geo6'] as $v => $table) {
    $gz = fetchUrl("https://iptoasn.com/data/ip2country-v$v.tsv.gz");
    $tsv = $gz === null ? false : @gzdecode($gz);
    if ($tsv === false) return;
    $db->beginTransaction();
    $db->exec("DELETE FROM $table");
    $ins = $db->prepare("INSERT OR REPLACE INTO $table (start, stop, cc) VALUES (?, ?, ?)");
    foreach (explode("\n", $tsv) as $line) {
      $f = explode("\t", trim($line));
      if (count($f) < 3 || $f[2] === 'None') continue;
      $a = ipKey($f[0]);
      $b = ipKey($f[1]);
      if ($a !== null && $b !== null) $ins->execute([$a, $b, $f[2]]);
    }
    $db->commit();
  }
  kvSet($db, 'geo', 'ok');
}

// IPv4 as an integer, IPv6 as 32 hex digits (which sort the same way as the addresses).
function ipKey(string $ip): int|string|null {
  $bin = @inet_pton($ip);
  if ($bin === false) return null;
  return strlen($bin) === 4 ? (int)sprintf('%u', ip2long($ip)) : bin2hex($bin);
}

function countryOf(PDO $db, string $ip): string {
  static $cache = [];
  if (isset($cache[$ip])) return $cache[$ip];
  $key = ipKey($ip);
  $cc = '';
  if ($key !== null) {
    $table = is_int($key) ? 'geo4' : 'geo6';
    $q = $db->prepare("SELECT stop, cc FROM $table WHERE start <= ? ORDER BY start DESC LIMIT 1");
    $q->execute([$key]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    if ($r && $key <= (is_int($key) ? (int)$r['stop'] : $r['stop'])) $cc = $r['cc'];
  }
  return $cache[$ip] = $cc;
}

// ---- access log ----

// Rotated logs (*.gz) are read once; the current one is re-read every time, and the line hash
// as id stops a line being counted twice when it later turns up again in its .gz.
// Returns how many networks were seen in the last LIVE_WINDOW seconds of the log. IONOS writes
// the log a few minutes behind, so the window ends at its newest line rather than now.
function ingestLogs(PDO $db, string $dir): int {
  $done = $db->query('SELECT name FROM logs_done')->fetchAll(PDO::FETCH_COLUMN);
  $ins = $db->prepare('INSERT OR IGNORE INTO events (id, t, kind, cc) VALUES (?, ?, ?, ?)');
  forgetOldSalts($db);
  $seen = []; // ip -> last time, from the current log
  $end = 0;
  foreach (glob("$dir/access.log.*") ?: [] as $path) {
    $name = basename($path);
    $gz = str_ends_with($name, '.gz');
    if (is_link($path) || ($gz && in_array($name, $done, true))) continue;
    $fh = $gz ? gzopen($path, 'r') : fopen($path, 'r');
    if (!$fh) continue;
    $db->beginTransaction();
    $last = '';
    while (($line = $gz ? gzgets($fh) : fgets($fh)) !== false) {
      $last = $line;
      if (!str_contains($line, ' ' . DOMAIN . ' ')) continue;
      $e = parseLine($line);
      if (!$e) continue;
      $salt = daySalt($db, $e['t']);
      $id = hash('sha256', $salt . ($e['kind'] === 'ping' ? $e['ip'] : $line));
      $ins->execute([$id, $e['t'], $e['kind'], countryOf($db, $e['ip'])]);
      if (!$gz) $seen[$e['ip']] = max($seen[$e['ip']] ?? 0, $e['t']);
    }
    $db->commit();
    $gz ? gzclose($fh) : fclose($fh);
    if (!$gz && preg_match('/\[([^\]]+)\]/', $last, $m) && ($t = DateTime::createFromFormat('d/M/Y:H:i:s O', $m[1]))) {
      $end = max($end, $t->getTimestamp());
    }
    if ($gz) $db->prepare('INSERT OR IGNORE INTO logs_done (name) VALUES (?)')->execute([$name]);
  }
  return count(array_filter($seen, fn($t) => $t > $end - LIVE_WINDOW));
}

// The random salt for the day of $t, made on first use.
function daySalt(PDO $db, int $t): string {
  static $salts = [];
  $k = 'salt_' . date('Y-m-d', $t);
  if (!isset($salts[$k])) {
    $salts[$k] = kvGet($db, $k)['v'] ?? null;
    if ($salts[$k] === null) kvSet($db, $k, $salts[$k] = bin2hex(random_bytes(16)));
  }
  return $salts[$k];
}

// Salts older than SALT_KEEP go. Ids from before day salts (an md5 of the line, or a hash with
// one salt kept for good) are swapped once for random ones, and that salt is dropped too.
function forgetOldSalts(PDO $db): void {
  $db->prepare("DELETE FROM kv WHERE k LIKE 'salt\_%' ESCAPE '\' AND t < ?")->execute([time() - SALT_KEEP]);
  if (!kvGet($db, 'salt')) return;
  $db->beginTransaction();
  $db->exec('UPDATE events SET id = lower(hex(randomblob(16)))');
  $db->exec("DELETE FROM kv WHERE k = 'salt'");
  $db->commit();
}

// IONOS format: ip - - [time] "METHOD path proto" status bytes host "referer" "agent" "-"
function parseLine(string $line): ?array {
  if (!preg_match('/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\S+) (\S+) "([^"]*)"/', $line, $m)) return null;
  [, $ip, $time, $method, $path, $status, $bytes, $host, $referer] = $m;
  if ($host !== DOMAIN || !str_starts_with($referer, 'https://www.geoguessr.com/')) return null;
  $path = strtok($path, '?');
  $ok = $status === '200' || $status === '304';
  $kind = match (true) {
    $path === '/ping.php' && $status === '204' => 'ping',
    // a successful generation returns the picture, hundreds of KB
    $method === 'POST' && $path === '/minecraft.php' && $ok && (int)$bytes > 10000 => 'world',
    $method === 'GET' && $path === '/minecraft.php' && $ok => 'caps',
    $ok && str_ends_with($path, '/app/index.html') => 'board',
    $ok && str_ends_with($path, '/lying-signs/worker.js') => 'signs',
    default => null,
  };
  $t = DateTime::createFromFormat('d/M/Y:H:i:s O', $time);
  return $kind && $t ? ['ip' => $ip, 't' => $t->getTimestamp(), 'kind' => $kind] : null;
}

// ---- store listings ----

function refreshStores(PDO $db, string $edgeId): void {
  $fetchers = [
    'chrome' => function () {
      $html = fetchUrl(CHROME_URL);
      return $html && preg_match('/>\s*([\d,]+)\+?\s+users?\s*</', $html, $m) ? (int)str_replace(',', '', $m[1]) : null;
    },
    'firefox' => function () {
      $j = json_decode((string)fetchUrl(FIREFOX_API), true);
      return isset($j['average_daily_users']) ? (int)$j['average_daily_users'] : null;
    },
    'edge' => function () use ($edgeId) {
      if ($edgeId === '') return null;
      $j = json_decode((string)fetchUrl(EDGE_API . rawurlencode($edgeId)), true);
      return isset($j['activeInstallCount']) ? (int)$j['activeInstallCount'] : null;
    },
  ];
  foreach ($fetchers as $store => $fetch) {
    $last = kvGet($db, "users_$store");
    if ($last && time() - $last['t'] < STORE_REFRESH) continue;
    $n = $fetch();
    // keep the last good number if a listing can't be read
    if ($n !== null) kvSet($db, "users_$store", (string)$n);
    elseif ($last) kvSet($db, "users_$store", $last['v']);
  }
}

function readStats(PDO $db): array {
  $users = [];
  foreach (['chrome' => 'Chrome', 'edge' => 'Edge', 'firefox' => 'Firefox'] as $k => $label) {
    $r = kvGet($db, "users_$k");
    if ($r) $users[$label] = (int)$r['v'];
  }
  $countries = $db->query("SELECT cc FROM events WHERE cc != '' GROUP BY cc ORDER BY COUNT(*) DESC")
    ->fetchAll(PDO::FETCH_COLUMN);
  return ['users' => $users, 'countries' => $countries];
}

// ---- drawing ----

// The tile on orlandopb.com/fun shows this full-bleed (object-fit: cover) with the title over
// its bottom third, at anything from about 1.1:1 (desktop) to 1.8:1 (phone). So it's 4:3, and
// the stats sit in the band every crop keeps: the middle 88% across, 15-55% down.
// Drawn at twice the size and scaled down, which smooths GD's edges.
function drawCard(array $s): string {
  $W = 1200; $H = 900; $k = 2;
  $font = current(array_filter(FONTS, 'is_file'));
  $im = imagecreatetruecolor($W * $k, $H * $k);

  // OGGS ocean blue, lighter at the top
  for ($y = 0; $y < $H * $k; $y++) {
    $f = $y / ($H * $k);
    $c = imagecolorallocate($im, (int)(52 - 26 * $f), (int)(118 - 44 * $f), (int)(230 - 56 * $f));
    imageline($im, 0, $y, $W * $k - 1, $y, $c);
  }

  // a faint globe rising from the bottom right
  $gx = (int)(0.86 * $W * $k); $gy = (int)(0.98 * $H * $k); $gr = (int)(0.42 * $H * $k);
  imagefilledellipse($im, $gx, $gy, 2 * $gr, 2 * $gr, imagecolorallocatealpha($im, 255, 255, 255, 118));
  imagesetthickness($im, 3 * $k);
  $line = imagecolorallocatealpha($im, 255, 255, 255, 108);
  foreach ([0.35, 0.7] as $m) imageellipse($im, $gx, $gy, (int)(2 * $gr * $m), 2 * $gr, $line);
  foreach ([-0.5, 0, 0.5] as $m) {
    $dy = (int)($gr * $m);
    $half = (int)sqrt($gr * $gr - $dy * $dy);
    imageline($im, $gx - $half, $gy + $dy, $gx + $half, $gy + $dy, $line);
  }
  imagesetthickness($im, 1);

  $white = imagecolorallocate($im, 255, 255, 255);
  $soft = imagecolorallocate($im, 220, 232, 255);
  $faint = imagecolorallocatealpha($im, 255, 255, 255, 96);
  $green = imagecolorallocate($im, 76, 217, 100);

  $cols = [
    [short(array_sum($s['users'])), 'downloads'],
    [(string)count($s['countries']), 'countries'],
    [short($s['live']), 'playing now'],
  ];
  $left = 0.06 * $W; $colW = 0.88 * $W / count($cols);
  $maxW = (int)(($colW - 50) * $k);
  // one size per row, the largest that fits every column ("o " stands in for the live dot)
  $bigSize = fitSize($font, 190 * $k, array_column($cols, 0), $maxW);
  $labelSize = fitSize($font, 60 * $k, [...array_column($cols, 1), 'o playing now'], $maxW);
  foreach ($cols as $i => [$big, $label]) {
    $cx = (int)(($left + ($i + 0.5) * $colW) * $k);
    centered($im, $font, $bigSize, $cx, 370 * $k, $big, $white);
    centered($im, $font, $labelSize, $cx, 465 * $k, $label, $soft);
    if ($i === 2) {
      // a green "live" dot left of "playing now"
      $d = 20 * $k;
      $x = (int)($cx - textWidth($font, $labelSize, $label) / 2 - $d * 1.1);
      imagefilledellipse($im, $x, (int)(465 * $k - $labelSize * 0.45), $d, $d, $green);
    }
    if ($i) {
      $x = (int)(($left + $i * $colW) * $k);
      imagefilledrectangle($im, $x - $k, 170 * $k, $x + $k, 480 * $k, $faint);
    }
  }

  $out = imagecreatetruecolor($W, $H);
  imagecopyresampled($out, $im, 0, 0, 0, 0, $W, $H, $W * $k, $H * $k);
  ob_start();
  imagepng($out, null, 9);
  return ob_get_clean();
}

function textWidth(string $font, float $size, string $text): int {
  $b = imagettfbbox($size, 0, $font, $text);
  return $b[2] - $b[0];
}

// $size, shrunk until every one of $texts fits $maxW.
function fitSize(string $font, float $size, array $texts, int $maxW): float {
  while ($size > 8 && max(array_map(fn($t) => textWidth($font, $size, $t), $texts)) > $maxW) $size *= 0.95;
  return $size;
}

// Text centred on $cx with its baseline at $y.
function centered(GdImage $im, string $font, float $size, int $cx, int $y, string $text, int $color): void {
  imagettftext($im, $size, 0, (int)($cx - textWidth($font, $size, $text) / 2), $y, $color, $font, $text);
}

function short(int $n): string {
  return $n >= 10000 ? round($n / 1000) . 'k' : ($n >= 1000 ? number_format($n / 1000, 1) . 'k' : (string)$n);
}
