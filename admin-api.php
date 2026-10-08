<?php
declare(strict_types=1);
// NomadQuest server editor API. PHP 8.1+. Paths are fixed by admin-config.php.
define('NOMAD_ADMIN_API', true);
// Every private data file is executable PHP that returns 404 before its payload.
const NQ_STORE_GUARD = "<?php http_response_code(404); exit; __halt_compiler();\n";
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

final class NQError extends RuntimeException {
    public int $httpStatus;
    public function __construct(string $message, int $status = 422) {
        parent::__construct($message); $this->httpStatus = $status;
    }
}
function nqFail(string $text, int $status = 422): void { throw new NQError($text, $status); }
function nqEncode($value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
}
function nqReply(array $value, int $status = 200): void {
    http_response_code($status); echo nqEncode($value); exit;
}
function nqDecode(string $bytes) {
    try { return json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $bytes), false, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { nqFail('JSON пішімі дұрыс емес. Файлдағы жақшалар мен үтірлерді тексеріңіз.'); }
}
function nqWithin(string $path, string $root): bool {
    $root = rtrim($root, DIRECTORY_SEPARATOR);
    return $path === $root || str_starts_with($path, $root . DIRECTORY_SEPARATOR);
}
function nqRead(string $path, bool $optional = false, int $limit = 6291456): ?string {
    clearstatcache(true, $path);
    if (is_link($path)) nqFail('Символдық сілтемемен жұмыс істеуге болмайды.', 500);
    if (!file_exists($path)) {
        if ($optional) return null;
        nqFail('Файл табылмады: ' . basename($path), 500);
    }
    if (!is_file($path) || filesize($path) > $limit) nqFail('Файл түрі немесе көлемі қолдау таппайды: ' . basename($path), 500);
    $value = file_get_contents($path);
    if ($value === false || strlen($value) > $limit) nqFail('Файлды оқу мүмкін болмады: ' . basename($path), 500);
    if (str_ends_with($path, '.php')) {
        if (!str_starts_with($value, NQ_STORE_GUARD)) nqFail('Қызметтік файлдың қорғанысы дұрыс емес.', 500);
        $value = substr($value, strlen(NQ_STORE_GUARD));
    }
    return $value;
}
function nqAtomic(string $path, string $bytes, int $mode = 0600): void {
    if (is_link($path)) nqFail('Символдық сілтемені өзгертуге болмайды.', 500);
    $protected = str_ends_with($path, '.php');
    if ($protected) $bytes = NQ_STORE_GUARD . $bytes;
    // Private temporary files keep the PHP extension and the same guard.
    $temp = dirname($path) . '/.nq-write-' . bin2hex(random_bytes(16)) . ($protected ? '.php' : '.tmp');
    $handle = fopen($temp, 'x+b');
    if ($handle === false) nqFail('Уақытша файл жасалмады. Қапшықтың жазу рұқсатын тексеріңіз.', 500);
    try {
        if (!chmod($temp, $mode)) nqFail('Файл рұқсатын орнату мүмкін болмады.', 500);
        $offset = 0; $length = strlen($bytes);
        while ($offset < $length) {
            $written = fwrite($handle, substr($bytes, $offset));
            if ($written === false || $written === 0) nqFail('Деректер толық жазылмады. Дисктегі бос орынды тексеріңіз.', 500);
            $offset += $written;
        }
        if (!fflush($handle)) nqFail('Деректерді дискіге жазу мүмкін болмады.', 500);
        fclose($handle); $handle = null;
        if (!rename($temp, $path)) nqFail('Файлды ауыстыру мүмкін болмады. Жазу рұқсатын тексеріңіз.', 500);
    } finally {
        if (is_resource($handle)) fclose($handle);
        if (is_file($temp)) unlink($temp);
    }
}
function nqGuardDirectory(string $dir): void {
    // Apache denies the whole directory; guarded .php files also protect payloads
    // where nginx ignores .htaccess. No plaintext secrets or sessions live here.
    $rules = "Options -Indexes\nRequire all denied\n";
    if (nqRead($dir.'/.htaccess', true) !== $rules) nqAtomic($dir.'/.htaccess', $rules, 0644);
    if (nqRead($dir.'/index.php', true) === null) nqAtomic($dir.'/index.php', '');
}
function nqInit(array $cfg): array {
    $root = realpath($cfg['game_dir']);
    if ($root === false || !is_dir($root)) nqFail('Ойын қапшығы табылмады. admin-config.php файлын тексеріңіз.', 500);
    $private = $cfg['private_dir'];
    if (!is_string($private) || $private === '' || $private[0] !== DIRECTORY_SEPARATOR) nqFail('private_dir үшін толық абсолюттік жол қажет.', 500);
    if (!is_dir($private) && !mkdir($private, 0700, true) && !is_dir($private)) nqFail('Жеке қапшық жасалмады. INSTALL.txt ішіндегі private_dir нұсқауын қараңыз.', 500);
    $private = realpath($private);
    if (!$private || $private === $root || nqWithin($root, $private)) nqFail('Қызметтік деректер үшін жеке ішкі қапшық қажет.', 500);
    if (!is_writable($private)) nqFail('Жеке қапшыққа жазу мүмкін емес. Қапшық рұқсатын тексеріңіз.', 500);
    if (!chmod($private, 0700)) nqFail('Жеке қапшық рұқсатын орнату мүмкін болмады.', 500);
    nqGuardDirectory($private);
    $dir = $private . '/backups';
    if (is_link($dir)) nqFail('Жеке қапшықта символдық сілтеме бар.', 500);
    if (!is_dir($dir) && !mkdir($dir, 0700) && !is_dir($dir)) nqFail('Қызметтік қапшық жасалмады.', 500);
    if (!chmod($dir, 0700)) nqFail('Қызметтік қапшық рұқсатын орнату мүмкін болмады.', 500);
    nqGuardDirectory($dir);
    return ['root'=>$root, 'private'=>$private, 'info'=>$root.'/locations-info.json', 'list'=>$root.'/locations.txt'];
}
function nqLocked(callable $callback) {
    global $nqPaths;
    $path = $nqPaths['private'].'/write.php';
    if (is_link($path)) nqFail('Бұғаттау файлы дұрыс емес.', 500);
    $handle = fopen($path, 'c');
    if ($handle === false || !flock($handle, LOCK_EX)) nqFail('Деректерді бұғаттау мүмкін болмады. Қайталап көріңіз.', 503);
    try {
        if (fstat($handle)['size'] === 0) {
            if (fwrite($handle, NQ_STORE_GUARD) !== strlen(NQ_STORE_GUARD) || !fflush($handle)) nqFail('Бұғаттау файлын дайындау мүмкін болмады.', 500);
            if (!chmod($path, 0600)) nqFail('Бұғаттау файлының рұқсатын орнату мүмкін болмады.', 500);
        }
        return $callback();
    }
    finally { flock($handle, LOCK_UN); fclose($handle); }
}
function nqCoord($p, string $label): array {
    if (!is_array($p) || !array_is_list($p) || count($p)<2 || count($p)>3) nqFail($label . ': координаттар жұбы қажет.');
    foreach ($p as $n) if ((!is_float($n) && !is_int($n)) || !is_finite((float)$n)) nqFail($label . ': координат сан болуы керек.');
    if (abs($p[0])>90 || abs($p[1])>180) nqFail($label . ': ендік −90…90, бойлық −180…180 аралығында болуы керек.');
    return $p;
}
function nqKey(array $p): string {
    return number_format((float)$p[0], 6, '.', '') . ',' . number_format((float)$p[1], 6, '.', '');
}
function nqList(string $text): array {
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text); $rows = [];
    foreach (preg_split('/\R/u', $text) as $i=>$line) {
        if (trim($line)==='') continue;
        $values = array_map('trim', explode(',', $line));
        if (count($values)!==2 || !is_numeric($values[0]) || !is_numeric($values[1])) nqFail('locations.txt: ' . ($i+1) . '-жолда екі координат болуы керек.');
        $rows[] = nqCoord([(float)$values[0], (float)$values[1]], ($i+1).'-жол');
        if (count($rows)>5000) nqFail('Кезеңдер саны 5000-нан аспауы керек.');
    }
    return $rows;
}
function nqBilingual($v, string $label): void {
    if (!($v instanceof stdClass)) nqFail($label . ': kk және ru мәтіндері бар нысан қажет.');
    foreach (['kk','ru'] as $lang) {
        if (property_exists($v,$lang) && (!is_string($v->$lang) || strlen($v->$lang)>200000)) nqFail($label . ': мәтін дұрыс емес немесе тым ұзын.');
    }
}
function nqValidateDoc($doc): array {
    if (!($doc instanceof stdClass) || ($doc->version ?? null)!==1 || !isset($doc->locations) || !is_array($doc->locations)) nqFail('Анықтамалықта version: 1 және locations тізімі болуы керек.');
    if (count($doc->locations)>2000) nqFail('Локациялар саны 2000-нан аспауы керек.');
    $keys=[];
    foreach ($doc->locations as $i=>$entry) {
        $label=($i+1).'-локация';
        if (!($entry instanceof stdClass)) nqFail($label . ': нысан пішімі дұрыс емес.');
        nqCoord($entry->coordinates ?? null,$label);
        if (property_exists($entry,'aliases') && (!is_array($entry->aliases) || count($entry->aliases)>100)) nqFail($label . ': aliases тізімі дұрыс емес.');
        foreach (array_merge([$entry->coordinates],$entry->aliases ?? []) as $p) {
            $key=nqKey(nqCoord($p,$label));
            if (isset($keys[$key]) && $keys[$key]!==$i) nqFail('Екі локацияға бір координат берілген: '.$key);
            $keys[$key]=$i;
        }
        foreach (['name','address','description','descriptionFull','dataNotes'] as $f) if (property_exists($entry,$f)) nqBilingual($entry->$f,$label.', '.$f);
        if (property_exists($entry,'hints')) {
            if (!($entry->hints instanceof stdClass)) nqFail($label . ': hints нысаны дұрыс емес.');
            foreach (['region','settlement'] as $f) if (property_exists($entry->hints,$f)) nqBilingual($entry->hints->$f,$label.', hints.'.$f);
        }
    }
    return $keys;
}
function nqValidate($doc, $rounds): void {
    $keys=nqValidateDoc($doc);
    if (!is_array($rounds) || !array_is_list($rounds) || count($rounds)<1 || count($rounds)>5000) nqFail('Ойынға кемінде бір локация енгізіңіз (ең көбі 5000 кезең).');
    foreach ($rounds as $i=>$p) if (!isset($keys[nqKey(nqCoord($p,($i+1).'-кезең'))])) nqFail(($i+1).'-кезеңнің нүктесі анықтамалықта жоқ.');
}
function nqRaw(): array {
    global $nqPaths;
    return ['info'=>nqRead($nqPaths['info'],true), 'list'=>nqRead($nqPaths['list'],true)];
}
function nqRevision(array $raw): string { return hash('sha256', nqEncode($raw)); }
function nqData(array $raw): array {
    $doc=$raw['info']===null ? (object)['version'=>1,'locations'=>[]] : nqDecode($raw['info']);
    nqValidateDoc($doc);
    return ['document'=>$doc,'rounds'=>nqList($raw['list']??'')];
}
function nqSnapshot($value): array {
    if (!($value instanceof stdClass) || !property_exists($value,'info') || !property_exists($value,'list')) nqFail('Резервтік көшірме дұрыс емес.',500);
    foreach (['info','list'] as $f) if ($value->$f!==null && !is_string($value->$f)) nqFail('Резервтік көшірме дұрыс емес.',500);
    return (array)$value;
}
function nqRestoreRaw(array $raw): void {
    global $nqPaths;
    foreach (['info','list'] as $field) {
        if ($raw[$field]===null) {
            if (is_file($nqPaths[$field]) && !unlink($nqPaths[$field])) nqFail('Файлды қалпына келтіру мүмкін болмады.',500);
        } else nqAtomic($nqPaths[$field],$raw[$field],0644);
    }
}
function nqRecover(): void {
    global $nqPaths;
    $file=$nqPaths['private'].'/pending.php';
    if (!file_exists($file)) return;
    $journal=nqDecode(nqRead($file,false,25165824));
    nqRestoreRaw(nqSnapshot($journal->before ?? null));
    if (!unlink($file)) nqFail('Қалпына келтіру журналын тазалау мүмкін болмады.',500);
}
function nqSave($doc, $rounds, $expected): array {
    global $nqPaths,$nqConfig;
    nqValidate($doc,$rounds);
    $before=nqRaw();
    if (!is_string($expected) || !hash_equals(nqRevision($before),$expected)) nqFail('Деректер басқа терезеде өзгертілді. Өз нұсқаңызды жүктеп алып, сервердегі деректерді қайта оқыңыз.',409);
    if (!is_writable($nqPaths['root'])) nqFail('Ойын қапшығына жазу рұқсаты жоқ. Timeweb файл рұқсаттарын тексеріңіз.',500);
    $info=nqEncode($doc);
    $list=implode("\n",array_map(function($p){return json_encode($p[0],JSON_THROW_ON_ERROR).','.json_encode($p[1],JSON_THROW_ON_ERROR);},$rounds))."\n";
    if (strlen($info)>6291456 || strlen($list)>6291456) nqFail('Әр деректер файлы 6 МБ-тан аспауы керек.');
    $backup=gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));
    nqAtomic($nqPaths['private'].'/backups/'.$backup.'.php',nqEncode(['createdAt'=>gmdate('c'),'before'=>$before]));
    $journal=$nqPaths['private'].'/pending.php';
    nqAtomic($journal,nqEncode(['before'=>$before]));
    // Each rename is atomic. The journal permits rollback of the pair.
    try {
        nqAtomic($nqPaths['info'],$info,0644);
        nqAtomic($nqPaths['list'],$list,0644);
        if (!unlink($journal)) nqFail('Сақтау журналын тазалау мүмкін болмады.',500);
    } catch (Throwable $e) { nqRecover(); throw $e; }
    $backups=glob($nqPaths['private'].'/backups/[0-9]*.php')?:[];rsort($backups,SORT_STRING);
    foreach (array_slice($backups,max(2,(int)$nqConfig['backup_limit'])) as $file) {
        if (!@unlink($file)) error_log('NomadQuest: old backup could not be removed.');
    }
    return ['revision'=>nqRevision(['info'=>$info,'list'=>$list]),'savedAt'=>gmdate('c'),'backup'=>$backup];
}
function nqAuth(): ?stdClass {
    global $nqPaths;
    $text=nqRead($nqPaths['private'].'/auth.php',true);
    if ($text===null) return null;
    $value=nqDecode($text);
    if (!($value instanceof stdClass) || !is_string($value->passwordHash??null) || !is_string($value->version??null)) nqFail('Кіру деректері зақымдалған. INSTALL.txt нұсқаулығын қараңыз.',500);
    return $value;
}
function nqPassword($p): string {
    if (!is_string($p) || str_contains($p,"\0") || preg_match_all('/./us',$p)<10) nqFail('Құпиясөз кемінде 10 таңбадан тұруы керек.');
    if (strlen($p)>72) nqFail('Құпиясөз тым ұзын. Оны қысқартыңыз.');
    return $p;
}
function nqAuthorized(): bool {
    $auth=nqAuth();$now=time();
    if (!$auth || !isset($_SESSION['authVersion'],$_SESSION['created'],$_SESSION['seen'])) return false;
    if (!is_string($_SESSION['authVersion']) || !hash_equals($auth->version,$_SESSION['authVersion']) || $now-$_SESSION['created']>28800 || $now-$_SESSION['seen']>1800) {
        unset($_SESSION['authVersion']);return false;
    }
    $_SESSION['seen']=$now;return true;
}
function nqSignIn(stdClass $auth): void {
    if (!session_regenerate_id(true)) nqFail('Сессияны жаңарту мүмкін болмады.',500);
    $_SESSION['authVersion']=$auth->version;$_SESSION['created']=$_SESSION['seen']=time();$_SESSION['csrf']=bin2hex(random_bytes(32));
}
function nqRate(): stdClass {
    global $nqPaths;
    $text=nqRead($nqPaths['private'].'/attempts.php',true);$data=$text===null?new stdClass():nqDecode($text);
    if (!($data instanceof stdClass)) nqFail('Кіру шектеуінің файлы дұрыс емес.',500);
    foreach ($data as $k=>$v) if ($v->until<time()) unset($data->$k);
    $key='ip_'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');
    if ((isset($data->$key)&&$data->$key->count>=5) || (isset($data->global)&&$data->global->count>=100)) nqFail('Кіру әрекеті тым көп. 15 минуттан кейін қайталаңыз.',429);
    return $data;
}
function nqRateFailed(stdClass $data): void {
    global $nqPaths;
    foreach (['ip_'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown'),'global'] as $key) {
        if (!isset($data->$key)) $data->$key=(object)['count'=>0,'until'=>time()+900];
        $data->$key->count++;
    }
    nqAtomic($nqPaths['private'].'/attempts.php',nqEncode($data));
}
function nqRateClear(stdClass $data): void {
    global $nqPaths;
    $key='ip_'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');unset($data->$key);
    nqAtomic($nqPaths['private'].'/attempts.php',nqEncode($data));
}
function nqBody(): stdClass {
    if (($_SERVER['REQUEST_METHOD']??'')!=='POST') nqFail('POST сұрауы қажет.',405);
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json') nqFail('JSON сұрауы қажет.',415);
    if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) nqFail('Сессияны жаңартып, қайта кіріңіз.',403);
    $text=file_get_contents('php://input',false,null,0,6291457);
    if ($text===false || strlen($text)>6291456) nqFail('Сұрау тым үлкен.',413);
    $body=nqDecode($text);
    if (!($body instanceof stdClass)) nqFail('JSON нысаны қажет.');
    return $body;
}
function nqDispatch(string $action): array {
    global $nqPaths,$nqConfig;
    // Read and write operations share a lock; a prior interrupted save is recovered.
    nqRecover();
    if ($action==='status') return ['authenticated'=>nqAuthorized(),'needsSetup'=>nqAuth()===null,'csrf'=>$_SESSION['csrf']];
    if (in_array($action,['setup','login'],true)) {
        $body=nqBody();$rates=nqRate();$auth=nqAuth();
        if ($action==='setup') {
            if ($auth!==null) nqFail('Админка бұрын бапталған.',409);
            if (!is_string($body->code??null) || !hash_equals($nqConfig['setup_code_hash'],hash('sha256',trim($body->code)))) { nqRateFailed($rates);nqFail('Белсендіру коды дұрыс емес.',401); }
            $password=nqPassword($body->password??null);
            if (!is_string($body->confirm??null) || $password!==$body->confirm) nqFail('Екі құпиясөз бірдей болуы керек.');
            $auth=(object)['passwordHash'=>password_hash($password,PASSWORD_DEFAULT),'version'=>bin2hex(random_bytes(24))];
            nqAtomic($nqPaths['private'].'/auth.php',nqEncode($auth));
        } else {
            if (!$auth || !is_string($body->password??null) || strlen($body->password)>72 || !password_verify($body->password,$auth->passwordHash)) { nqRateFailed($rates);nqFail('Құпиясөз дұрыс емес.',401); }
        }
        nqRateClear($rates);nqSignIn($auth);return ['authenticated'=>true,'csrf'=>$_SESSION['csrf']];
    }
    if (!nqAuthorized()) nqFail('Сессия аяқталды. Қайта кіріңіз; енгізілген өзгерістер бетте сақталады.',401);
    if ($action==='load') { $raw=nqRaw();return nqData($raw)+['revision'=>nqRevision($raw)]; }
    if ($action==='backups') {
        $files=glob($nqPaths['private'].'/backups/[0-9]*.php')?:[];rsort($files,SORT_STRING);$rows=[];
        foreach ($files as $file) $rows[]=['id'=>basename($file,'.php'),'date'=>gmdate('c',filemtime($file))];
        return ['backups'=>$rows];
    }
    if ($action==='backup') {
        $id=$_GET['id']??'';
        if (!is_string($id) || !preg_match('/^\d{8}-\d{6}-[a-f0-9]{8}$/D',$id)) nqFail('Көшірме атауы дұрыс емес.');
        $record=nqDecode(nqRead($nqPaths['private'].'/backups/'.$id.'.php',false,25165824));
        return nqData(nqSnapshot($record->before??null))+['revision'=>nqRevision(nqRaw()),'fromBackup'=>$id];
    }
    $body=nqBody();
    if ($action==='save') return nqSave($body->document??null,$body->rounds??null,$body->revision??null);
    if ($action==='password') {
        $rates=nqRate();$auth=nqAuth();
        if (!is_string($body->current??null) || strlen($body->current)>72 || !password_verify($body->current,$auth->passwordHash)) { nqRateFailed($rates);nqFail('Қазіргі құпиясөз дұрыс емес.',422); }
        $password=nqPassword($body->password??null);
        if (!is_string($body->confirm??null) || $password!==$body->confirm) nqFail('Екі құпиясөз бірдей болуы керек.');
        $auth->passwordHash=password_hash($password,PASSWORD_DEFAULT);$auth->version=bin2hex(random_bytes(24));
        nqAtomic($nqPaths['private'].'/auth.php',nqEncode($auth));nqRateClear($rates);nqSignIn($auth);return ['csrf'=>$_SESSION['csrf']];
    }
    if ($action==='logout') {
        $_SESSION=[];session_destroy();$cookie=session_get_cookie_params();
        setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>$cookie['path'],'secure'=>$cookie['secure'],'httponly'=>true,'samesite'=>'Strict']);
        return ['ok'=>true];
    }
    nqFail('Сұрау табылмады.',404);
}

try {
    if (PHP_VERSION_ID<80100) nqFail('PHP 8.1 немесе одан жаңа нұсқасы қажет. Хостингтен PHP 8.3/8.4 таңдаңыз.',500);
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if (!in_array($method,['GET','POST'],true)) nqFail('Сұрау әдісі қолдау таппайды.',405);
    $https=(!empty($_SERVER['HTTPS'])&&strtolower((string)$_SERVER['HTTPS'])!=='off') || ($_SERVER['REQUEST_SCHEME']??'')==='https';
    $host=(string)($_SERVER['HTTP_HOST']??'');
    $local=preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/D',$host)===1 && in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true);
    if (!$https && !$local) nqFail('Админканы HTTPS мекенжайы арқылы ашыңыз.',403);
    $nqConfig=require __DIR__.'/admin-config.php';
    if (!is_array($nqConfig) || !preg_match('/^[a-f0-9]{64}$/D',$nqConfig['setup_code_hash']??'')) nqFail('admin-config.php баптауы аяқталмаған.',500);
    $nqPaths=nqInit($nqConfig);
    ini_set('session.use_only_cookies','1');ini_set('session.use_strict_mode','1');ini_set('session.gc_maxlifetime','28800');
    // Use the host's configured PHP session handler/path. Never publish sess_* files.
    // Keep the unique session name below to separate this admin from other apps.
    session_name('NQADMIN_'.substr(hash('sha256',__DIR__),0,12));
    $cookiePath=str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME']??'/admin-api.php'));
    $cookiePath=$cookiePath==='/'?'/':rtrim($cookiePath,'/').'/';
    session_set_cookie_params(['lifetime'=>0,'path'=>$cookiePath,'secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);
    if (!session_start()) nqFail('Сессия ашылмады. Хостинг баптауын тексеріңіз.',500);
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) $_SESSION['csrf']=bin2hex(random_bytes(32));
    $action=$_GET['action']??'status';
    if (!is_string($action)) nqFail('Сұрау атауы дұрыс емес.');
    nqReply(nqLocked(fn()=>nqDispatch($action)));
} catch (NQError $e) {
    nqReply(['error'=>$e->getMessage()],$e->httpStatus);
} catch (Throwable $e) {
    error_log('NomadQuest admin: '.get_class($e).': '.$e->getMessage());
    nqReply(['error'=>'Сервер сұрауды орындай алмады. Timeweb қате журналын және файл рұқсаттарын тексеріңіз.'],500);
}
