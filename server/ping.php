<?php
// Heartbeat from OGGS 2.0+: the page calls this every couple of minutes while geoguessr.com is
// open and visible, with nothing in it. Nothing is read or stored here; card.php counts these
// requests in the access log for "playing now" and the country count.
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
http_response_code(204);
