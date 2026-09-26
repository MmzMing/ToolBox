import type { InstallGuideStep } from '@/utils/install-guide'

/** 方言标记：仅用于单测与资料分层，页面文案统一走 i18n 的 diff 说明 */
export type SqlDialect = 'mysql' | 'postgres' | 'sqlserver' | 'oracle' | 'sqlite'

export interface SqlMemoItem {
  /** i18n 键前缀来源：语法名 `<key>-title` */
  titleKey: string
  /** 一句话用途 `<key>-desc` */
  descKey: string
  /** 展示并整体复制的 SQL / 命令（可多行） */
  code: string
  /** 可选：易踩的坑 `<key>-note` */
  noteKey?: string
  /** 可选：其他方言写法 `<key>-diff` */
  diffKey?: string
}

export interface SqlMemoGroup {
  id: string
  items: SqlMemoItem[]
}

interface ItemOptions {
  note?: true
  diff?: true
}

/** 由统一前缀派生四个 i18n 键，避免手写键名与语言包对不上 */
function item(key: string, code: string, opts: ItemOptions = {}): SqlMemoItem {
  return {
    titleKey: `${key}-title`,
    descKey: `${key}-desc`,
    code,
    noteKey: opts.note ? `${key}-note` : undefined,
    diffKey: opts.diff ? `${key}-diff` : undefined,
  }
}

/** 一条语法用到的全部 i18n 键后缀，供单测校验双语齐全 */
export function sqlMemoItemKeys(items: readonly SqlMemoItem[]): string[] {
  return items.flatMap((entry) =>
    [entry.titleKey, entry.descKey, entry.noteKey, entry.diffKey].filter(
      (key): key is string => typeof key === 'string',
    ),
  )
}

const MYSQL_DIR = 'D:\\mysql84'
const MYSQL_DATA = 'D:\\mysql84-data'

const MY_INI = `[mysqld]
basedir=${MYSQL_DIR.replace(/\\/g, '/')}
datadir=${MYSQL_DATA.replace(/\\/g, '/')}
port=3306
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
# must be decided BEFORE --initialize, changing it later breaks startup
lower_case_table_names=1
max_connections=200
log-error=${MYSQL_DATA.replace(/\\/g, '/')}/mysqld.err
slow_query_log=1
long_query_time=1
innodb_buffer_pool_size=1G
default-time-zone='+08:00'

[client]
port=3306
default-character-set=utf8mb4`

const MYSQL_COMPOSE = `services:
  mysql8:
    image: mysql:8.4
    container_name: mysql8
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: YourStrong#Pwd1
      MYSQL_DATABASE: demo
    volumes:
      - mysql-data:/var/lib/mysql
      - ./conf.d/mysqld.cnf:/etc/mysql/conf.d/mysqld.cnf:ro
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_0900_ai_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-pYourStrong#Pwd1"]
      interval: 10s
      retries: 10
      start_period: 30s
volumes:
  mysql-data:`

/** MySQL 8.x 安装引导（Windows ZIP 免安装版 + Docker） */
export const mysqlInstallGuide: readonly InstallGuideStep[] = [
  {
    id: 'my-download',
    detailKey: 'guide.my-download.detail',
    blocks: [
      {
        kind: 'link',
        labelKey: 'guide.my-download.link',
        url: 'https://dev.mysql.com/downloads/mysql/',
      },
      {
        kind: 'code',
        value: 'mysql-8.4.x-winx64.zip',
        noteKey: 'guide.my-download.code-note',
      },
    ],
  },
  {
    id: 'my-extract',
    detailKey: 'guide.my-extract.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.my-extract.basedir', value: MYSQL_DIR },
          { labelKey: 'guide.my-extract.datadir', value: MYSQL_DATA },
        ],
      },
    ],
  },
  {
    id: 'my-path',
    detailKey: 'guide.my-path.detail',
    blocks: [
      { kind: 'code', value: `setx /M PATH "%PATH%;${MYSQL_DIR}\\bin"` },
      { kind: 'code', value: 'mysqld --version', noteKey: 'guide.my-path.note' },
    ],
  },
  {
    id: 'my-ini',
    detailKey: 'guide.my-ini.detail',
    blocks: [
      {
        kind: 'file',
        nameKey: 'guide.my-ini.file',
        content: MY_INI,
        noteKey: 'guide.my-ini.note',
      },
    ],
  },
  {
    id: 'my-init',
    detailKey: 'guide.my-init.detail',
    blocks: [
      {
        kind: 'code',
        value: `"${MYSQL_DIR}\\bin\\mysqld" --defaults-file="${MYSQL_DIR}\\my.ini" --initialize-insecure --console`,
        noteKey: 'guide.my-init.code-insecure',
      },
      {
        kind: 'code',
        value: `"${MYSQL_DIR}\\bin\\mysqld" --defaults-file="${MYSQL_DIR}\\my.ini" --initialize --console`,
        noteKey: 'guide.my-init.code-secure',
      },
      {
        kind: 'code',
        value: `findstr /C:"temporary password" "${MYSQL_DATA}\\mysqld.err"`,
        noteKey: 'guide.my-init.find',
      },
    ],
  },
  {
    id: 'my-service',
    detailKey: 'guide.my-service.detail',
    blocks: [
      {
        kind: 'code',
        value: `"${MYSQL_DIR}\\bin\\mysqld" --install MySQL80 --defaults-file="${MYSQL_DIR}\\my.ini"`,
      },
      { kind: 'code', value: 'net start MySQL80' },
      {
        kind: 'code',
        value: 'net stop MySQL80 && sc delete MySQL80',
        noteKey: 'guide.my-service.note',
      },
    ],
  },
  {
    id: 'my-login',
    detailKey: 'guide.my-login.detail',
    blocks: [
      { kind: 'code', value: 'mysql -h 127.0.0.1 -P 3306 -uroot -p --protocol=tcp' },
      {
        kind: 'code',
        value: `ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'YourStrong#Pwd1';
FLUSH PRIVILEGES;`,
      },
    ],
  },
  {
    id: 'my-verify',
    detailKey: 'guide.my-verify.detail',
    blocks: [
      { kind: 'code', value: `SHOW VARIABLES LIKE 'character_set%';` },
      { kind: 'code', value: `SELECT HEX('中文测试');  -- E4B8AD E69687 E6B58B E8AF95` },
      { kind: 'code', value: 'SELECT VERSION(), @@transaction_isolation, @@autocommit;' },
    ],
  },
  {
    id: 'my-docker',
    detailKey: 'guide.my-docker.detail',
    blocks: [
      {
        kind: 'code',
        value: `docker run -d --name mysql8 -p 3306:3306 \\
  -e MYSQL_ROOT_PASSWORD=YourStrong#Pwd1 -e MYSQL_DATABASE=demo \\
  -v mysql-data:/var/lib/mysql \\
  mysql:8.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci`,
      },
      { kind: 'file', nameKey: 'guide.my-docker.file', content: MYSQL_COMPOSE },
    ],
  },
  {
    id: 'my-trouble',
    detailKey: 'guide.my-trouble.detail',
    blocks: [
      {
        kind: 'code',
        value: 'mysql -h 127.0.0.1 -P 3306 -uroot -p',
        noteKey: 'guide.my-trouble.denied',
      },
      {
        kind: 'code',
        value: 'jdbc:mysql://127.0.0.1:3306/demo?allowPublicKeyRetrieval=true&useSSL=false',
        noteKey: 'guide.my-trouble.pubkey',
      },
      {
        kind: 'code',
        value: `ALTER USER 'app'@'%' IDENTIFIED WITH mysql_native_password BY 'YourStrong#Pwd1';`,
        noteKey: 'guide.my-trouble.plugin',
      },
      {
        kind: 'code',
        value: `"${MYSQL_DIR}\\bin\\mysqld" --init-file="${MYSQL_DIR}\\mysql-init.txt"`,
        noteKey: 'guide.my-trouble.forget',
      },
    ],
  },
]

const PG_DIR = 'D:\\PostgreSQL\\18'
const PG_DATA = 'D:\\pgsql\\data'

const PG_HBA = `# TYPE  DATABASE  USER      ADDRESS        METHOD
local   all       postgres                 scram-sha-256
host    all       all       127.0.0.1/32   scram-sha-256
host    all       all       10.0.0.0/8     scram-sha-256
# never do this: world reachable + deprecated hash
# host all all 0.0.0.0/0 md5`

const PG_CONF = `listen_addresses = '*'          # default localhost; needs restart
port = 5432                     # needs restart
max_connections = 100           # needs restart
shared_buffers = 1GB            # ~25% of RAM; needs restart
logging_collector = on
log_directory = 'log'
TimeZone = 'Asia/Shanghai'
client_encoding = 'UTF8'
password_encryption = 'scram-sha-256'`

const PG_COMPOSE = `services:
  pg:
    image: postgres:17
    container_name: pg17
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: YourStrongPwd
      POSTGRES_DB: demo
      POSTGRES_USER: app
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d demo"]
      interval: 10s
      retries: 5
volumes:
  pg-data:`

/** PostgreSQL 安装引导（Windows 安装器 / 命令行 initdb + Docker） */
export const postgresInstallGuide: readonly InstallGuideStep[] = [
  {
    id: 'pg-download',
    detailKey: 'guide.pg-download.detail',
    blocks: [
      {
        kind: 'link',
        labelKey: 'guide.pg-download.link-installer',
        url: 'https://www.enterprisedb.com/downloads/postgres-postgresql-downloads',
      },
      {
        kind: 'link',
        labelKey: 'guide.pg-download.link-binaries',
        url: 'https://www.enterprisedb.com/download-postgresql-binaries',
      },
      { kind: 'code', value: 'SELECT version();', noteKey: 'guide.pg-download.note' },
    ],
  },
  {
    id: 'pg-installer',
    detailKey: 'guide.pg-installer.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.pg-installer.dir', value: PG_DIR },
          { labelKey: 'guide.pg-installer.data', value: `${PG_DIR}\\data` },
          { labelKey: 'guide.pg-installer.port', value: '5432' },
          { labelKey: 'guide.pg-installer.user', value: 'postgres' },
        ],
      },
      { kind: 'code', value: 'Get-Service -Name postgres*', noteKey: 'guide.pg-installer.service' },
    ],
  },
  {
    id: 'pg-path',
    detailKey: 'guide.pg-path.detail',
    blocks: [{ kind: 'code', value: `setx /M PATH "%PATH%;${PG_DIR}\\bin"` }],
  },
  {
    id: 'pg-initdb',
    detailKey: 'guide.pg-initdb.detail',
    blocks: [
      {
        kind: 'code',
        value: `initdb -D ${PG_DATA} --encoding=UTF8 --locale=C \\
  --auth-local=scram-sha-256 --auth-host=scram-sha-256 -U postgres`,
        noteKey: 'guide.pg-initdb.note',
      },
      {
        kind: 'code',
        value: `pg_ctl -D ${PG_DATA} -l logfile start`,
        noteKey: 'guide.pg-initdb.start',
      },
      { kind: 'code', value: `pg_ctl -D ${PG_DATA} status / restart / stop` },
    ],
  },
  {
    id: 'pg-psql',
    detailKey: 'guide.pg-psql.detail',
    blocks: [
      { kind: 'code', value: 'psql -U postgres -h 127.0.0.1 -p 5432' },
      { kind: 'code', value: 'psql -U postgres -c "SELECT version();"' },
      {
        kind: 'code',
        value: '\\conninfo   \\l+   \\du   \\dt+   \\d+ tablename',
        noteKey: 'guide.pg-psql.note',
      },
    ],
  },
  {
    id: 'pg-conf',
    detailKey: 'guide.pg-conf.detail',
    blocks: [
      { kind: 'file', nameKey: 'guide.pg-conf.file', content: PG_CONF },
      { kind: 'file', nameKey: 'guide.pg-hba.file', content: PG_HBA, noteKey: 'guide.pg-hba.note' },
    ],
  },
  {
    id: 'pg-reload',
    detailKey: 'guide.pg-reload.detail',
    blocks: [
      { kind: 'code', value: 'SELECT pg_reload_conf();' },
      {
        kind: 'code',
        value: 'SELECT name, setting, pending_restart FROM pg_settings WHERE pending_restart;',
        noteKey: 'guide.pg-reload.note',
      },
    ],
  },
  {
    id: 'pg-remote',
    detailKey: 'guide.pg-remote.detail',
    blocks: [
      {
        kind: 'code',
        value:
          'netsh advfirewall firewall add rule name="PostgreSQL" dir=in action=allow protocol=TCP localport=5432',
      },
      {
        kind: 'code',
        value: 'psql -U postgres -h <server-ip> -d postgres',
        noteKey: 'guide.pg-remote.note',
      },
    ],
  },
  {
    id: 'pg-docker',
    detailKey: 'guide.pg-docker.detail',
    blocks: [
      {
        kind: 'code',
        value: `docker run -d --name pg17 -p 5432:5432 \\
  -e POSTGRES_PASSWORD=YourStrongPwd -e POSTGRES_DB=demo -e POSTGRES_USER=app \\
  -e PGDATA=/var/lib/postgresql/data/pgdata \\
  -v pg-data:/var/lib/postgresql/data postgres:17`,
        noteKey: 'guide.pg-docker.note17',
      },
      {
        kind: 'code',
        value:
          'docker run -d --name pg18 -v pg18-data:/var/lib/postgresql -e POSTGRES_PASSWORD=x postgres:18',
        noteKey: 'guide.pg-docker.note18',
      },
      { kind: 'file', nameKey: 'guide.pg-docker.file', content: PG_COMPOSE },
    ],
  },
  {
    id: 'pg-trouble',
    detailKey: 'guide.pg-trouble.detail',
    blocks: [
      {
        kind: 'code',
        value: "ALTER USER postgres PASSWORD 'NewStrongPwd';  -- md5 hash vs scram-sha-256",
        noteKey: 'guide.pg-trouble.auth',
      },
      {
        kind: 'code',
        value: 'SHOW server_encoding; SHOW client_encoding;',
        noteKey: 'guide.pg-trouble.enc',
      },
      {
        kind: 'code',
        value: 'docker compose down && docker volume rm <project>_pg-data',
        noteKey: 'guide.pg-trouble.volume',
      },
    ],
  },
]

/**
 * SQL 速查静态数据（MySQL 8.x 主线，方言差异单列 diff 说明）。
 * 分组顺序即页面卡片顺序。
 */
export const sqlMemoGroups: readonly SqlMemoGroup[] = [
  {
    id: 'concepts',
    items: [
      item(
        'layers',
        `-- DDL 数据定义：CREATE / ALTER / DROP / TRUNCATE / RENAME
-- DML 数据操作：INSERT / UPDATE / DELETE / REPLACE
-- DQL 数据查询：SELECT
-- DCL 数据控制：GRANT / REVOKE / CREATE USER
-- TCL 事务控制：BEGIN / COMMIT / ROLLBACK / SAVEPOINT`,
      ),
      item(
        'write-order',
        `SELECT [DISTINCT] 列
FROM 表 [JOIN 表 ON 条件]
WHERE 行过滤
GROUP BY 列
HAVING 组过滤
ORDER BY 列 [ASC|DESC]
LIMIT 条数 [OFFSET 偏移]`,
      ),
      item(
        'exec-order',
        `FROM / JOIN  →  WHERE  →  GROUP BY  →  HAVING  →  SELECT(含 DISTINCT)  →  ORDER BY  →  LIMIT`,
        { note: true },
      ),
      item(
        'comments',
        `-- 单行注释（两个减号后必须有空格）
# 单行注释（MySQL 专有）
/* 块注释，可跨行 */
/*+ HASH_JOIN(t1, t2) */ -- 8.0 优化器提示也写成这种注释`,
      ),
      item('identifiers', 'SELECT `order`, `用户表` FROM `my-db`.`select`;', {
        note: true,
        diff: true,
      }),
      item(
        'null-logic',
        `SELECT 1 = NULL;        -- NULL（不是 false）
WHERE col = NULL         -- 永远查不到，三值逻辑
WHERE col IS NULL        -- 正确写法
WHERE col <=> NULL       -- MySQL 空安全等于
WHERE col <> 'a'         -- 漏掉 NULL 行
WHERE col <> 'a' OR col IS NULL`,
        { note: true },
      ),
    ],
  },
  {
    id: 'select',
    items: [
      item('sel-columns', 'SELECT id, name, email FROM user WHERE status = 1;'),
      item(
        'sel-star',
        `SELECT * FROM user;              -- 省事但会拖回无用列
SELECT COUNT(*) FROM user;         -- 这里的 * 合法，统计行数用`,
        { note: true },
      ),
      item(
        'sel-expr',
        `SELECT name, price * count AS amount, stock - lock_num AS available
FROM order_item;`,
        { note: true },
      ),
      item('sel-table-alias', 'SELECT o.id, u.name FROM `order` o JOIN user u ON u.id = o.uid;'),
      item('sel-distinct', 'SELECT DISTINCT city FROM user;'),
      item(
        'sel-distinct-multi',
        `SELECT DISTINCT city, level FROM user;   -- 按两列组合去重
SELECT COUNT(DISTINCT city) FROM user;`,
      ),
      item(
        'sel-where',
        `WHERE status = 1 AND deleted_at IS NULL
WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01'`,
      ),
      item(
        'sel-order',
        `ORDER BY create_time DESC
ORDER BY status ASC, score DESC, id ASC
ORDER BY RAND()                    -- 随机取，全表排序极慢`,
        { note: true },
      ),
      item(
        'sel-limit',
        `LIMIT 10               -- 前 10 行
LIMIT 20, 10           -- 偏移 20 取 10（MySQL 专有顺序）
LIMIT 10 OFFSET 20     -- 标准写法
ORDER BY id DESC LIMIT 1;`,
        { diff: true },
      ),
    ],
  },
  {
    id: 'operator',
    items: [
      item(
        'op-arithmetic',
        `SELECT 7 / 2,        -- 3.5000（/ 结果恒为小数）
       7 DIV 2,       -- 3（整数除法）
       7 % 2,         -- 1
       MOD(7, 2),     -- 1
       NULL + 1;      -- NULL`,
      ),
      item('op-comparison', `=  <>  !=  <  >  <=  >=  <=>(空安全等于)`, { note: true }),
      item('op-logical', 'WHERE is_vip = 1 AND (level >= 5 OR score > 90) AND NOT deleted;', {
        note: true,
      }),
      item(
        'op-between',
        `WHERE age BETWEEN 18 AND 30            -- 闭区间 [18, 30]
WHERE created_at BETWEEN '2026-01-01' AND '2026-01-31 23:59:59'
WHERE age NOT BETWEEN 18 AND 30`,
        { note: true },
      ),
      item(
        'op-in',
        `WHERE id IN (1, 2, 3)
WHERE id NOT IN (1, 2, 3)
WHERE id IN (SELECT uid FROM admin)`,
        { note: true },
      ),
      item(
        'op-like',
        `WHERE name LIKE '张%'      -- % 任意长度（含 0 个）字符
WHERE name LIKE '张_'            -- _ 恰好一个字符
WHERE name LIKE '%三%'            -- 前置通配符，索引失效
WHERE name LIKE '%\\%off%' ESCAPE '\\\\'`,
        { note: true, diff: true },
      ),
      item(
        'op-null-test',
        `WHERE col IS NULL
WHERE col IS NOT NULL
WHERE flag IS TRUE / IS FALSE / IS UNKNOWN`,
      ),
      item(
        'op-quantifier',
        `WHERE score > ALL (SELECT score FROM class WHERE id = 2)
WHERE score > ANY (SELECT ...)   -- 等价 SOME(...)
WHERE score > (SELECT MAX(score) FROM ...)  -- 推荐写法`,
        { note: true },
      ),
      item('op-bitwise', 'SELECT 6 & 3, 6 | 3, 6 ^ 3, 6 << 1, 6 >> 1, ~6;', { diff: true }),
    ],
  },
  {
    id: 'join',
    items: [
      item('join-inner', 'SELECT a.id, b.name FROM order a INNER JOIN user b ON b.id = a.uid;'),
      item(
        'join-left',
        `SELECT u.id, o.id AS order_id
FROM user u LEFT JOIN \`order\` o ON o.uid = u.id;`,
        { note: true },
      ),
      item('join-right', 'FROM a RIGHT JOIN b ON ...  -- 保留右表全部行，改写成 LEFT JOIN 更常见'),
      item(
        'join-full',
        `SELECT * FROM a LEFT JOIN b ON a.id = b.id
UNION
SELECT * FROM a RIGHT JOIN b ON a.id = b.id;`,
        { note: true, diff: true },
      ),
      item('join-cross', 'SELECT a.x, b.y FROM t1 a CROSS JOIN t2 b;  -- 笛卡尔积，无 ON'),
      item('join-natural', 'SELECT * FROM t1 NATURAL JOIN t2;  -- 按同名列自动等值，重名即炸', {
        note: true,
      }),
      item(
        'join-self',
        `SELECT e.name, m.name AS manager
FROM employee e LEFT JOIN employee m ON m.id = e.manager_id;`,
      ),
      item(
        'join-using',
        `-- USING 要求两表列名完全相同，结果里该列只出现一次
SELECT * FROM order o JOIN user u USING (uid);
-- 多键
JOIN b USING (tenant_id, user_id)`,
        { note: true },
      ),
      item(
        'join-multi',
        `FROM a
JOIN b ON b.id = a.bid
LEFT JOIN c ON c.aid = a.id AND c.status = 1
WHERE b.x = 1`,
      ),
      item(
        'join-anti',
        `-- 找没有订单的用户：反连接
SELECT u.* FROM user u
LEFT JOIN \`order\` o ON o.uid = u.id
WHERE o.id IS NULL;
-- 也可用 NOT EXISTS（比 NOT IN 抗 NULL）`,
        { note: true },
      ),
      item(
        'join-semi',
        `SELECT u.* FROM user u
WHERE EXISTS (SELECT 1 FROM \`order\` o WHERE o.uid = u.id AND o.amount > 100);`,
        { note: true },
      ),
      item(
        'join-lateral',
        `SELECT u.id, x.recent_order_id
FROM user u
LEFT JOIN LATERAL (
  SELECT id AS recent_order_id FROM \`order\` o WHERE o.uid = u.id
  ORDER BY id DESC LIMIT 1
) x ON TRUE;`,
        { note: true, diff: true },
      ),
    ],
  },
  {
    id: 'group',
    items: [
      item(
        'gb-basic',
        `SELECT status, COUNT(*) AS cnt
FROM user
GROUP BY status;`,
      ),
      item(
        'gb-multi',
        `SELECT city, level, COUNT(*)
FROM user
GROUP BY city, level
HAVING COUNT(*) > 10;`,
      ),
      item(
        'gb-having',
        `WHERE 在分组前行级过滤（不能用聚合函数）
HAVING 在分组后组级过滤（能用聚合函数）
SELECT city, COUNT(*) c FROM user
WHERE status = 1 GROUP BY city HAVING c > 100;`,
        { note: true },
      ),
      item(
        'gb-alias',
        'SELECT city AS c, COUNT(*) FROM user GROUP BY c;  -- GROUP BY 可用 SELECT 别名',
        {
          diff: true,
        },
      ),
      item(
        'gb-rollup',
        `SELECT city, level, COUNT(*)
FROM user GROUP BY city, level WITH ROLLUP;
-- 额外输出小计行 + 总计行，NULL 表示该层汇总
SELECT city, GROUPING(city), COUNT(*) FROM user GROUP BY city WITH ROLLUP;`,
        { note: true, diff: true },
      ),
      item('gb-only-full', 'SELECT city, name, COUNT(*) FROM user GROUP BY city;  -- 报错 1140', {
        note: true,
      }),
      item('gb-any-value', 'SELECT id, ANY_VALUE(name) FROM t GROUP BY DATE(create_time);', {
        note: true,
      }),
    ],
  },
  {
    id: 'agg',
    items: [
      item(
        'agg-count',
        `SELECT COUNT(*) FROM t;            -- 行数（含 NULL 行）
SELECT COUNT(1) FROM t;            -- 同 COUNT(*)
SELECT COUNT(col) FROM t;          -- 该列非 NULL 的个数
SELECT COUNT(DISTINCT city) FROM t;`,
        { note: true },
      ),
      item('agg-sum', 'SELECT SUM(amount), SUM(IF(status=1, amount, 0)) FROM order;', {
        note: true,
      }),
      item('agg-avg', 'SELECT AVG(score), ROUND(AVG(score), 2) FROM student;', { note: true }),
      item(
        'agg-minmax',
        `SELECT MIN(create_time), MAX(create_time) FROM t;
SELECT user_id, MAX(id) FROM t GROUP BY user_id;  -- 取每组最新一条的 id`,
      ),
      item(
        'agg-group-concat',
        `SELECT GROUP_CONCAT(DISTINCT name ORDER BY name SEPARATOR ', ')
FROM t GROUP BY pid;`,
        { note: true, diff: true },
      ),
      item('agg-std', 'SELECT STDDEV(score), VARIANCE(score), BIT_AND(m), BIT_OR(m) FROM t;'),
      item(
        'agg-json',
        `SELECT name, JSON_ARRAYAGG(id) FROM t;
SELECT JSON_OBJECTAGG(id, name) FROM t;`,
        { note: true },
      ),
      item(
        'agg-filter',
        `SELECT COUNT(*) FILTER (WHERE status = 1)
FROM t;
-- MySQL has no FILTER, write:
SELECT SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) FROM t;`,
        { diff: true },
      ),
    ],
  },
  {
    id: 'window',
    items: [
      item(
        'win-over',
        `SELECT id, city, amount,
       SUM(amount) OVER (PARTITION BY city) AS city_total
FROM orders;`,
        { note: true },
      ),
      item(
        'win-running',
        `SELECT id, create_time, amount,
       SUM(amount) OVER (ORDER BY id) AS running_total,
       SUM(amount) OVER (ORDER BY id ROWS 6 PRECEDING) AS last7_sum,
       AVG(amount) OVER (ORDER BY id ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma7
FROM orders;`,
        { note: true },
      ),
      item(
        'win-frame',
        `OVER (ORDER BY dt
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ROWS UNBOUNDED PRECEDING
  RANGE BETWEEN 100 PRECEDING AND 100 FOLLOWING)
-- PG / SQL Server 2022+ / Oracle also support:
--   GROUPS BETWEEN 1 PRECEDING AND 1 FOLLOWING
--   ... EXCLUDE CURRENT ROW | GROUP | TIES | NO OTHERS`,
        { note: true, diff: true },
      ),
      item(
        'win-row-number',
        `SELECT *, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY id DESC) AS rn
FROM orders;`,
      ),
      item(
        'win-rank',
        `RANK()        -- 1,1,3 并列跳号
DENSE_RANK()    -- 1,1,2 并列不跳号
ROW_NUMBER()    -- 1,2,3 强制唯一
PERCENT_RANK()  -- (rank-1)/(n-1)
CUME_DIST()     -- 累计占比`,
      ),
      item(
        'win-topn',
        `SELECT * FROM (
  SELECT o.*, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY amount DESC) rn
  FROM orders o
) x WHERE x.rn <= 3;`,
        { note: true },
      ),
      item('win-dedupe', 'DELETE t1 FROM dup t1 JOIN dup t2 ON t1.id < t2.id AND t1.k = t2.k;', {
        note: true,
      }),
      item(
        'win-ntile',
        `SELECT id, NTILE(4) OVER (ORDER BY score DESC) AS quartile FROM student;
SELECT id, PERCENT_RANK() OVER (ORDER BY score) FROM student;`,
      ),
      item(
        'win-lag-lead',
        `SELECT month, amount,
       LAG(amount, 1) OVER (ORDER BY month) AS prev_month,
       LAG(amount, 1, 0) OVER (ORDER BY month) AS prev0,
       LEAD(amount) OVER (PARTITION BY city ORDER BY month) AS next_m,
       amount - LAG(amount) OVER (ORDER BY month) AS mom_diff,
       amount / NULLIF(LAG(amount, 12) OVER (ORDER BY month), 0) - 1 AS yoy
FROM stats;`,
        { note: true, diff: true },
      ),
      item(
        'win-first-last',
        `FIRST_VALUE(amount) OVER (ORDER BY id)
LAST_VALUE(amount)  OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
NTH_VALUE(amount, 2) OVER (ORDER BY id ROWS UNBOUNDED PRECEDING)`,
        { note: true },
      ),
      item(
        'win-named',
        `SELECT id, SUM(amount) OVER w1, AVG(amount) OVER w2
FROM orders
WINDOW w1 AS (PARTITION BY uid ORDER BY id),
       w2 AS (w1 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW);`,
        { note: true },
      ),
    ],
  },
  {
    id: 'subquery',
    items: [
      item(
        'sq-scalar',
        `SELECT id, (SELECT name FROM user u WHERE u.id = o.uid) AS buyer
FROM orders o;
SELECT * FROM t WHERE amount > (SELECT AVG(amount) FROM t);`,
        { note: true },
      ),
      item(
        'sq-derived',
        `SELECT c.city, c.cnt
FROM (SELECT city, COUNT(*) cnt FROM user GROUP BY city) c
WHERE c.cnt > 100;`,
        { note: true },
      ),
      item('sq-in', 'SELECT * FROM user WHERE id IN (SELECT uid FROM admin WHERE type = 1);', {
        note: true,
      }),
      item(
        'sq-exists',
        'SELECT * FROM user u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.uid = u.id);',
        {
          note: true,
        },
      ),
      item(
        'sq-correlated',
        `SELECT * FROM orders o
WHERE amount > (SELECT AVG(amount) FROM orders WHERE uid = o.uid);`,
      ),
      item(
        'sq-rewrite',
        `-- NOT IN + NULL 会整体查不到，改写为 NOT EXISTS 更安全
SELECT u.* FROM user u
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.uid = u.id);`,
        { note: true },
      ),
      item('sq-row', 'WHERE (uid, status) IN ((1, 2), (2, 3))  -- 行构造器多列匹配', {
        note: true,
      }),
      item(
        'cte-basic',
        `WITH vip AS (
  SELECT id, city FROM user WHERE level >= 5
)
SELECT * FROM vip WHERE city = 'SH';`,
        { note: true },
      ),
      item(
        'cte-multi',
        `WITH a AS (SELECT 1 AS x),
     b AS (SELECT 2 AS y)
SELECT * FROM a, b;`,
      ),
      item(
        'cte-recursive',
        `WITH RECURSIVE nums AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < 10
)
SELECT n FROM nums;`,
        { note: true },
      ),
      item(
        'cte-tree',
        `WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, 1 AS lvl, CAST(name AS CHAR(200)) AS path
  FROM category WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.lvl + 1, CONCAT(t.path, ' / ', c.name)
  FROM category c JOIN tree t ON t.id = c.parent_id
)
SELECT * FROM tree ORDER BY path;`,
        { note: true },
      ),
      item('union', 'SELECT city FROM a UNION SELECT city FROM b;  -- 去重 + 排序，代价高'),
      item('union-all', 'SELECT 1 AS x UNION ALL SELECT 2;  -- 不去重，快，优先用'),
      item(
        'set-ops',
        `SELECT id FROM a INTERSECT SELECT id FROM b;  -- 交集
SELECT id FROM a EXCEPT SELECT id FROM b;        -- 差集
(SELECT id FROM a ORDER BY id LIMIT 5)
UNION ALL
(SELECT id FROM b ORDER BY id LIMIT 5)
ORDER BY id DESC;`,
        { note: true, diff: true },
      ),
    ],
  },
  {
    id: 'string',
    items: [
      item(
        'str-concat',
        `SELECT CONCAT('a', '-', 'b');           -- 'a-b'，任一参数 NULL 则整体 NULL
SELECT CONCAT_WS(',', name, city);      -- 跳过 NULL，用分隔符连接
SELECT name || city;                    -- 标准写法，默认模式下 || 是逻辑或`,
        { note: true, diff: true },
      ),
      item(
        'str-length',
        `SELECT LENGTH('中文');        -- 6（字节数，随字符集变）
SELECT CHAR_LENGTH('中文');  -- 2（字符数）
SELECT BIT_LENGTH('a');      -- 8`,
        { note: true },
      ),
      item(
        'str-sub',
        `SELECT SUBSTRING('abcdef', 2, 3);   -- 'bcd'，起点 1 开始计数
SELECT SUBSTRING('abcdef' FROM 2 FOR 3); -- 标准写法
SELECT LEFT('abcdef', 2), RIGHT('abcdef', 2);
SELECT SUBSTRING_INDEX('a,b,c', ',', 2);  -- 'a,b'；-2 从右取`,
        { diff: true },
      ),
      item(
        'str-pos',
        `SELECT LOCATE('cd', 'abcd');     -- 3，等价 POSITION/INSTR
SELECT POSITION('cd' IN 'abcd');
SELECT FIND_IN_SET('b', 'a,b,c');   -- 2，在逗号串里定位
SELECT FIELD('b', 'a', 'b', 'c');   -- 2`,
      ),
      item(
        'str-replace',
        `SELECT REPLACE('a-b-c', '-', '_');
SELECT INSERT('abcdef', 2, 3, 'X');  -- 从第 2 个字符起替换 3 个
SELECT REPEAT('ab', 3), REVERSE('abc'), SPACE(4);
SELECT ELT(2, 'a', 'b', 'c');       -- 'b'，按序号取参数`,
        { note: true },
      ),
      item(
        'str-trim',
        `SELECT TRIM('  a  ');                  -- 去两端空格
SELECT TRIM(BOTH 'x' FROM 'xxaxx');  -- 去指定字符
SELECT LTRIM(...), RTRIM(...);
SELECT TRIM(TRAILING '0' FROM '1000');  -- '1'`,
      ),
      item(
        'str-case-pad',
        `SELECT UPPER('ab'), LOWER('AB');
SELECT LCASE('AB'), UCASE('ab');   -- 同义写法
SELECT LPAD('7', 3, '0');          -- '007'
SELECT RPAD('ab', 5, '*');         -- 'ab***'`,
        { note: true },
      ),
      item(
        'str-format',
        `SELECT FORMAT(1234.5, 2);        -- '1,234.50'
SELECT HEX('中'), UNHEX('E4B8AD');
SELECT TO_BASE64('abc'), FROM_BASE64('YWJj');
SELECT QUOTE('a''b');              -- 带安全转义的引号串
SELECT ASCII('A'), ORD('A'), CHAR(77, 79);  -- 65 / 65 / 'MO'`,
        { note: true },
      ),
      item(
        'str-regex',
        `SELECT REGEXP_LIKE('abc123', '[0-9]+$');   -- 1
SELECT REGEXP_SUBSTR('a1b22', '[0-9]+');   -- '1'
SELECT REGEXP_REPLACE('a1b', '[0-9]', '#');
SELECT REGEXP_INSTR('a1b', 'b');`,
        { note: true, diff: true },
      ),
      item('str-collate-sort', 'SELECT name FROM t ORDER BY name COLLATE utf8mb4_bin;', {
        note: true,
      }),
      item(
        'str-split-rows',
        'SELECT * FROM JSON_TABLE(\'["a","b"]\', "$[*]" COLUMNS(v VARCHAR(20) PATH "$"));',
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'math',
    items: [
      item(
        'num-round',
        `SELECT ROUND(2.5);            -- 3（.5 远离零取整）
SELECT ROUND(1.23456, 2);  -- 1.23
SELECT TRUNCATE(1.23456, 2);  -- 1.23（直接截断）
SELECT CEIL(1.2), CEILING(-1.2), FLOOR(1.8), FLOOR(-1.8);`,
        { note: true },
      ),
      item(
        'num-basic',
        `SELECT ABS(-3), SIGN(-3), MOD(10, 3), PI(), CRC32('abc');
SELECT POW(2, 10), POWER(2, 10), SQRT(16);
SELECT EXP(1), LN(2.718), LOG(2), LOG2(8), LOG10(100);
SELECT LOG(16, 2);   -- 以 16 为底：3`,
      ),
      item(
        'num-rand',
        `SELECT RAND();            -- [0,1)，每次调用都变
SELECT RAND(42);        -- 带种子，结果可复现
SELECT FLOOR(1 + RAND() * 49);  -- 1~49 随机整数
SELECT UUID(), UUID_SHORT(), RANDOM_BYTES(16);`,
        { note: true },
      ),
      item(
        'num-greatest',
        `SELECT GREATEST(1, 5, 3), LEAST(1, 5, 3);
SELECT GREATEST(1, NULL);  -- NULL，任一参数 NULL 即 NULL`,
        { note: true },
      ),
      item(
        'cast',
        `SELECT CAST('12abc' AS SIGNED);        -- 12（静默截断并告警）
SELECT CAST(12.9 AS DECIMAL(5,2));
SELECT CAST(NOW() AS DATE);
SELECT CONVERT('中文' USING utf8mb4);
SELECT '9' + 0, 9 + '0a';   -- 隐式转换：字符串转数字`,
        { note: true, diff: true },
      ),
      item(
        'decimal-div',
        `SELECT 1 / 3;                 -- 0.3333
SELECT CAST(1 AS DECIMAL(20,10)) / 3;
SELECT SUM(price) / COUNT(*) FROM t;  -- DECIMAL 相加不丢精度`,
        { note: true },
      ),
    ],
  },
  {
    id: 'date',
    items: [
      item(
        'dt-now',
        `SELECT NOW();              -- 2026-09-27 10:00:00
SELECT CURDATE(), CURRENT_DATE;
SELECT CURTIME(), CURRENT_TIME;
SELECT SYSDATE();        -- 取系统时刻，与 NOW() 在语句开始时间不同
SELECT UTC_TIMESTAMP(), UNIX_TIMESTAMP();`,
        { note: true },
      ),
      item(
        'dt-parts',
        `SELECT YEAR(NOW()), MONTH(NOW()), DAY(NOW());
SELECT HOUR(NOW()), MINUTE(NOW()), SECOND(NOW()), MICROSECOND(NOW());
SELECT DAYOFWEEK(NOW());   -- 1=周日 ... 7=周六
SELECT WEEKDAY(NOW());     -- 0=周一 ... 6=周日
SELECT DAYOFYEAR(NOW()), WEEK(NOW()), LAST_DAY(NOW());
SELECT EXTRACT(MONTH FROM NOW());
SELECT MONTHNAME(NOW()), DAYNAME(NOW());`,
        { note: true },
      ),
      item(
        'dt-add',
        `SELECT DATE_ADD(NOW(), INTERVAL 1 DAY);
SELECT DATE_SUB(NOW(), INTERVAL 3 MONTH);
SELECT NOW() + INTERVAL 7 DAY;        -- 等价简写
SELECT ADDDATE(NOW(), 5), SUBDATE(NOW(), 5);
SELECT ADDTIME('10:00:00', '1:30:00');
-- units: MICROSECOND SECOND MINUTE HOUR DAY WEEK MONTH QUARTER YEAR
--        SECOND_MICROSECOND DAY_HOUR YEAR_MONTH ...`,
        { diff: true },
      ),
      item(
        'dt-diff',
        `SELECT DATEDIFF('2026-12-31', '2026-01-01');   -- 364（只算天数差）
SELECT TIMESTAMPDIFF(MONTH, '2026-01-01', '2026-09-27');
SELECT TIMESTAMPDIFF(SECOND, a, b);
SELECT TIMESTAMPADD(DAY, 3, NOW());`,
        { note: true },
      ),
      item(
        'dt-format',
        `SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s');
-- %Y 4位年 %y 2位年 %m 月(01-12) %c 月(1-12) %d 日(01-31) %e 日(1-31)
-- %H/%h/%I 时(24/12) %k/%l 不补零 %i 分 %s/%S 秒 %f 微秒
-- %p AM/PM %r 12小时制全式 %T 24小时制全式
-- %j 年内天序 %W 星期名 %a 缩写 %M 月份名 %b 缩写
-- %x ISO年 %v ISO周 %D 带后缀日 %% 百分号`,
        { note: true, diff: true },
      ),
      item(
        'dt-parse',
        `SELECT STR_TO_DATE('2026/09/27', '%Y/%m/%d');
SELECT STR_TO_DATE('27-09-2026 10:20', '%d-%m-%Y %H:%i');
SELECT DATE('2026-09-27 10:00:00'), TIME('2026-09-27 10:00:00');
SELECT MAKEDATE(2026, 100), MAKETIME(10, 20, 0);`,
      ),
      item(
        'dt-unix',
        `SELECT UNIX_TIMESTAMP(NOW());          -- 秒级时间戳
SELECT UNIX_TIMESTAMP(NOW(3)) * 1000;  -- 毫秒（注意精度）
SELECT FROM_UNIXTIME(1790000000);
SELECT FROM_UNIXTIME(1790000000, '%Y-%m');`,
        { note: true },
      ),
      item(
        'dt-tz',
        `SELECT @@global.time_zone, @@session.time_zone;
SET time_zone = '+08:00';
SELECT CONVERT_TZ(NOW(), @@session.time_zone, '+00:00');
SELECT CONVERT_TZ(NOW(), '+08:00', 'Asia/Shanghai');  -- 需时区表已加载`,
        { note: true },
      ),
      item(
        'dt-range',
        `WHERE create_time >= '2026-09-01' AND create_time < '2026-10-01'
WHERE DATE(create_time) = CURDATE()          -- 函数包裹，索引失效
WHERE create_time >= CURDATE() AND create_time < CURDATE() + INTERVAL 1 DAY`,
        { note: true },
      ),
      item(
        'dt-group',
        `SELECT DATE_FORMAT(create_time, '%Y-%m') AS ym, COUNT(*)
FROM orders GROUP BY ym ORDER BY ym;
SELECT YEAR(create_time) y, MONTH(create_time) m, COUNT(*) FROM orders GROUP BY y, m;
SELECT WEEK(DATE(create_time)) wk, COUNT(*) FROM orders GROUP BY wk;`,
      ),
      item(
        'dt-types',
        `CREATE TABLE t (
  d DATE,               -- 日期 1000-01-01..9999-12-31，3 字节
  dt DATETIME(3),       -- 日期+时间，8 字节，fsp 小数秒 0~6
  ts TIMESTAMP(3),      -- 按会话时区写入、存成 UTC，范围 1970-01-01 ~ 2038-01-19
  tm TIME(3),           -- 时间，可超 24 小时（如 '-838:59:59'）
  y YEAR                -- 1901..2155，1 字节
);`,
        { note: true },
      ),
      item(
        'dt-default',
        `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(3),
expired_at TIMESTAMP NULL DEFAULT NULL`,
        { note: true },
      ),
    ],
  },
  {
    id: 'cond',
    items: [
      item(
        'cond-case-when',
        `SELECT CASE
  WHEN score >= 90 THEN 'A'
  WHEN score >= 60 THEN 'B'
  ELSE 'C'
END AS grade
FROM student;`,
        { note: true },
      ),
      item(
        'cond-case-simple',
        `SELECT CASE status
  WHEN 1 THEN '待付款'
  WHEN 2 THEN '已发货'
  ELSE '其他'
END
FROM orders;`,
      ),
      item(
        'cond-if',
        `SELECT IF(score >= 60, 'pass', 'fail') FROM student;
SELECT IFNULL(x, 0);          -- 两参数，x 为 NULL 时取 0
SELECT COALESCE(a, b, c, 0);  -- 多参数，标准写法
SELECT NULLIF(a, b);          -- 相等返回 NULL，用于防除零
SELECT IFNULL(NULLIF(b, 0), 1);  -- a / IFNULL(NULLIF(b,0),1)`,
        { note: true, diff: true },
      ),
      item(
        'cond-bool',
        `SELECT (status = 1) AS is_valid;      -- 1/0
SELECT SUM(status = 1) AS valid_cnt FROM t;  -- 条件计数
SELECT COUNT(*) - SUM(deleted = 1) FROM t;`,
        { note: true },
      ),
      item(
        'cond-is-null-func',
        'SELECT ISNULL(x);  -- 返回 1/0，仅 1 个参数\nSELECT x IS NULL;     -- 标准等价写法',
        {
          diff: true,
        },
      ),
      item(
        'cond-branch-order',
        `SELECT CASE WHEN a > 1 THEN 'big' WHEN a > 0 THEN 'pos' END
FROM t;  -- 先命中的分支生效，条件需按互斥顺序写`,
      ),
    ],
  },
  {
    id: 'json',
    items: [
      item(
        'json-extract',
        `SELECT doc->'$.name' FROM t;              -- 等价 JSON_EXTRACT
SELECT doc->>'$.name' FROM t;             -- 去引号，等价 JSON_UNQUOTE(JSON_EXTRACT(..))
SELECT JSON_EXTRACT(doc, '$.items[0].id', '$.a.b') FROM t;
SELECT JSON_EXTRACT(doc, '$**.name') FROM t;   -- 任意层级`,
        { note: true },
      ),
      item(
        'json-build',
        `SELECT JSON_OBJECT('id', 1, 'name', 'a');
SELECT JSON_ARRAY(1, 'a', NULL);
SELECT JSON_ARRAYAGG(name) FROM t;
SELECT CAST('[1,2]' AS JSON);`,
      ),
      item(
        'json-modify',
        `UPDATE t SET doc = JSON_SET(doc, '$.a', 1, '$.b.x', 'y') WHERE id = 1;
SELECT JSON_INSERT(doc, '$.c', 3);  -- 不存在才插
SELECT JSON_REPLACE(doc, '$.a', 9); -- 存在才改
SELECT JSON_REMOVE(doc, '$.b'), JSON_MERGE_PATCH(a, b);`,
      ),
      item(
        'json-query',
        `SELECT JSON_CONTAINS(doc, '1', '$.ids');
SELECT JSON_CONTAINS_PATH(doc, 'one', '$.a', '$.b');
SELECT JSON_LENGTH(doc), JSON_DEPTH(doc), JSON_KEYS(doc);
SELECT JSON_TYPE(doc->'$.a'), JSON_VALID('{"a":1}');
SELECT JSON_QUOTE('a"b'), JSON_PRETTY(doc);`,
      ),
      item(
        'json-table',
        `SELECT jt.id
FROM t,
JSON_TABLE(doc, '$.items[*]' COLUMNS (
  id INT PATH '$.id',
  price DECIMAL(10,2) PATH '$.price' WITH JSON ERROR ON ERROR
)) AS jt;`,
        { note: true, diff: true },
      ),
      item(
        'json-search',
        `SELECT JSON_SEARCH(doc, 'one', 'abc', NULL, '$.*.name');
SELECT JSON_EXTRACT(doc, '$[last]'), JSON_EXTRACT(doc, '$[0 to 3]');`,
      ),
      item(
        'json-index',
        `ALTER TABLE t
  ADD COLUMN uid INT GENERATED ALWAYS AS (doc->>'$.uid') STORED NOT NULL,
  ADD INDEX idx_uid (uid);
ALTER TABLE t ADD INDEX idx_tags ((CAST(doc->'$.tags' AS CHAR(64) ARRAY)));`,
        { note: true },
      ),
    ],
  },
  {
    id: 'type',
    items: [
      item(
        'type-int',
        `TINYINT   1B  -128..127 / 0..255
SMALLINT    2B  -32768..32767
MEDIUMINT   3B
INT     4B  -21亿..21亿
BIGINT  8B  约 ±9.2e18
-- (n) 只显示宽度不影响范围，8.0.17 起已废弃`,
        { note: true },
      ),
      item(
        'type-decimal',
        `DECIMAL(10,2)  -- 精确小数，金额必用，最大精度 65
FLOAT / DOUBLE     -- 二进制浮点，有舍入误差，勿存金额
SELECT 0.1 + 0.2 = 0.3;           -- 浮点下为 0（近似）
SELECT CAST(0.1 AS DECIMAL(3,2)) + CAST(0.2 AS DECIMAL(3,2));`,
        { note: true },
      ),
      item(
        'type-bool',
        `flag TINYINT(1)     -- 语义上的布尔
SELECT TRUE, FALSE, 1 = true;  -- 常量 1 / 0
BOOLEAN / BOOL 都是 TINYINT(1) 的别名
BIT(8)          -- 位字段，取值用 b'1010'`,
      ),
      item(
        'type-char',
        `CHAR(n)      定长 0~255 字符，尾部空格被补齐/截掉
VARCHAR(n)     变长，n 是字符数而非字节数，整行所有列共享 65535 字节上限
TEXT 家族      TINYTEXT 255B / TEXT 64KB / MEDIUMTEXT 16MB / LONGTEXT 4GB
BINARY/VARBINARY / BLOB 家族  存字节而非字符`,
        { note: true },
      ),
      item('type-enum', "status ENUM('new','paid','done') DEFAULT 'new'", { note: true }),
      item(
        'type-json',
        `doc JSON NOT NULL   -- 二进制存储、可查字段、自动校验
-- 不可建索引列本身，需生成列或多值索引；不可设默认值（8.0.13 前）`,
      ),
      item(
        'type-generated',
        `full_name VARCHAR(100) AS (CONCAT(first_name, ' ', last_name)) VIRTUAL,
amount_yuan DECIMAL(10,2) AS (fee / 100) STORED,
INDEX idx_full (full_name)   -- 虚拟生成列可建索引`,
        { note: true },
      ),
      item(
        'type-auto',
        `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
ALTER TABLE t AUTO_INCREMENT = 1000001;  -- 只能抬高不能压低`,
        { note: true, diff: true },
      ),
    ],
  },
  {
    id: 'charset',
    items: [
      item('cs-choose', 'CREATE DATABASE mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;', {
        note: true,
      }),
      item(
        'cs-levels',
        `-- 四级设置：服务器 → 数据库 → 表 → 列 → 连接
SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'collation%';
SET NAMES utf8mb4;   -- 同时改 client/connection/results`,
      ),
      item(
        'cs-collation',
        `utf8mb4_general_ci    -- 快，排序较粗糙
utf8mb4_unicode_ci      -- 更符合语言习惯
utf8mb4_0900_ai_ci      -- 8.0 默认，性能与准确性最好
utf8mb4_bin             -- 二进制比较，区分大小写与重音`,
        { note: true },
      ),
      item(
        'cs-convert',
        `ALTER DATABASE mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE t CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE t MODIFY name VARCHAR(50) CHARACTER SET utf8mb4;`,
        { note: true },
      ),
      item(
        'cs-emoji-check',
        "SELECT HEX('中文测试');  -- utf8mb4 正确：E4B8AD E69687 E6B58B E8AF95\nSELECT LENGTH('中'), CHAR_LENGTH('中');  -- 3 / 1",
        {
          note: true,
        },
      ),
      item('cs-where', 'SELECT * FROM t WHERE name COLLATE utf8mb4_bin = "Abc";', {
        note: true,
      }),
    ],
  },
  {
    id: 'dml',
    items: [
      item(
        'ins-basic',
        `INSERT INTO user (id, name, city) VALUES (1, 'a', 'SH');
INSERT INTO user VALUES (1, 'a', NULL);   -- 列顺序必须与表一致，勿用
INSERT INTO user (name) VALUES ('a'), ('b'), ('c');  -- 多行`,
        { note: true },
      ),
      item('ins-set', "INSERT INTO user SET name = 'a', city = 'SH';", { note: true }),
      item(
        'ins-select',
        `INSERT INTO user_bak (id, name)
SELECT id, name FROM user WHERE city = 'SH';
CREATE TABLE t2 LIKE t1;   -- 先复制结构再插`,
      ),
      item('ins-ignore', 'INSERT IGNORE INTO t (a) VALUES (1);  -- 遇唯一键冲突/警告则跳过该行', {
        note: true,
      }),
      item(
        'ins-upsert',
        `INSERT INTO stat (day, cnt) VALUES ('2026-09-27', 1)
ON DUPLICATE KEY UPDATE cnt = cnt + 1, updated_at = NOW();
-- 8.0.19+ 可用行别名（8.0.20 起 VALUES() 已废弃）
INSERT INTO t (k, v) VALUES (1, 10) AS new
ON DUPLICATE KEY UPDATE v = new.v;`,
        { note: true, diff: true },
      ),
      item(
        'ins-replace',
        'REPLACE INTO t (id, name) VALUES (1, "b");  -- 冲突则先 DELETE 再 INSERT',
        {
          note: true,
        },
      ),
      item(
        'ins-lastid',
        `SELECT LAST_INSERT_ID();           -- 本次批量插入的首个自增 id
SELECT ROW_COUNT();                   -- 受影响行数
SELECT UUID();                        -- 需要预生成主键时用`,
      ),
      item(
        'upd-basic',
        `UPDATE user SET city = 'BJ', updated_at = NOW() WHERE id = 1;
UPDATE user SET score = score + 10 WHERE level > 3 ORDER BY id LIMIT 100;
UPDATE t SET a = DEFAULT;  -- 恢复列默认值`,
        { note: true },
      ),
      item(
        'upd-join',
        `UPDATE orders o JOIN user u ON u.id = o.uid
SET o.city = u.city
WHERE o.city IS NULL;`,
        { note: true },
      ),
      item(
        'del-basic',
        `DELETE FROM user WHERE id = 1;
DELETE o, i FROM orders o JOIN order_item i ON i.oid = o.id WHERE o.created_at < '2025-01-01';
DELETE FROM t WHERE status = 9 ORDER BY id LIMIT 500;   -- 分批删`,
        { note: true },
      ),
      item(
        'truncate',
        `TRUNCATE TABLE t;   -- DDL：清空全部行、重置自增、不走逐行删除、不可回滚
DELETE FROM t;        -- DML：可带 WHERE、可回滚、触发触发器、慢
DROP TABLE t;         -- 连表结构一起删`,
        { note: true },
      ),
      item(
        'load-data',
        "LOAD DATA LOCAL INFILE 'a.csv'\nINTO TABLE t FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"'\nLINES TERMINATED BY '\\n' (name, city);",
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'ddl',
    items: [
      item(
        'ddl-create',
        `CREATE TABLE IF NOT EXISTS \`order\` (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_no   VARCHAR(32)     NOT NULL COMMENT '订单号',
  uid        BIGINT UNSIGNED NOT NULL COMMENT '用户 id',
  amount     DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '金额',
  status     TINYINT         NOT NULL DEFAULT 0 COMMENT '0新建 1已付 2已发',
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_uid_status (uid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='订单表';`,
      ),
      item(
        'ddl-engine',
        `-- 表选项：ENGINE / CHARSET / COLLATION / COMMENT / AUTO_INCREMENT / ROW_FORMAT
ALTER TABLE t ENGINE=InnoDB;
ALTER TABLE t ROW_FORMAT=DYNAMIC;   -- utf8mb4 长索引需 DYNAMIC + innodb_large_prefix
SHOW TABLE STATUS WHERE Name='t';`,
        { note: true },
      ),
      item('ddl-like', 'CREATE TABLE t_bak LIKE t;            -- 复制结构含索引，不含数据'),
      item(
        'ddl-as-select',
        'CREATE TABLE t_sum AS SELECT uid, SUM(amount) s FROM orders GROUP BY uid;',
        {
          note: true,
        },
      ),
      item(
        'ddl-add-col',
        `ALTER TABLE t ADD COLUMN email VARCHAR(100) NOT NULL DEFAULT '' AFTER name;
ALTER TABLE t ADD COLUMN a INT FIRST, ADD COLUMN b INT;  -- 一次多列`,
        { note: true, diff: true },
      ),
      item(
        'ddl-modify-change',
        `ALTER TABLE t MODIFY COLUMN name VARCHAR(80) NOT NULL;        -- 只改类型/属性
ALTER TABLE t CHANGE COLUMN name user_name VARCHAR(80) NOT NULL;     -- 同时改名
ALTER TABLE t ALTER COLUMN name SET DEFAULT 'x';
ALTER TABLE t ALTER COLUMN name DROP DEFAULT;`,
        { note: true, diff: true },
      ),
      item('ddl-drop-col', 'ALTER TABLE t DROP COLUMN email;', { diff: true }),
      item(
        'ddl-comment',
        "ALTER TABLE t MODIFY COLUMN status TINYINT NOT NULL COMMENT '状态';\nALTER TABLE t COMMENT = '订单表';",
      ),
      item(
        'ddl-rename',
        `RENAME TABLE t TO t_old, t_new TO t;   -- 原子换表，可做无锁切换
ALTER TABLE t RENAME TO t2;
ALTER TABLE t RENAME COLUMN a TO b;   -- 8.0.3+`,
        { note: true },
      ),
      item(
        'ddl-online',
        `ALTER TABLE t ADD COLUMN x INT, ALGORITHM=INSTANT;         -- 秒加列（8.0.12+）
ALTER TABLE t ADD INDEX idx_x (x), ALGORITHM=INPLACE, LOCK=NONE;  -- 在线建索引
ALTER TABLE t DROP INDEX idx_y, ALGORITHM=COPY;                  -- 需重建表，锁写`,
        { note: true },
      ),
      item(
        'ddl-drop',
        `DROP TABLE IF EXISTS t1, t2;
TRUNCATE TABLE t;
DROP DATABASE IF EXISTS mydb;   -- 先切走 USE，否则报错`,
      ),
      item(
        'ddl-partition',
        'ALTER TABLE t PARTITION BY RANGE (YEAR(created_at)) (\n  PARTITION p2025 VALUES LESS THAN (2026),\n  PARTITION p2026 VALUES LESS THAN (2027)\n);',
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'constraint',
    items: [
      item(
        'c-pk',
        `id BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT,
-- 或表级：PRIMARY KEY (id),
ALTER TABLE t DROP PRIMARY KEY, ADD PRIMARY KEY (tenant_id, id);`,
        { note: true },
      ),
      item(
        'c-fk',
        `CONSTRAINT fk_order_user FOREIGN KEY (uid) REFERENCES \`user\` (id)
  ON DELETE RESTRICT ON UPDATE CASCADE,
ALTER TABLE orders DROP FOREIGN KEY fk_order_user;`,
        { note: true },
      ),
      item(
        'c-fk-actions',
        `RESTRICT / NO ACTION  -- 有引用就拒绝（默认）
CASCADE               -- 联动删/改
SET NULL              -- 置 NULL，列必须可空
SET DEFAULT           -- MySQL 中不推荐，InnoDB 会报错`,
        { note: true },
      ),
      item(
        'c-unique',
        'UNIQUE KEY uk_email (email);\nALTER TABLE t ADD CONSTRAINT uk_email UNIQUE (email);',
        {
          note: true,
        },
      ),
      item('c-notnull', 'name VARCHAR(50) NOT NULL,  -- 配合 DEFAULT 使用，别拿 NULL 当空串', {
        note: true,
      }),
      item(
        'c-default',
        "status TINYINT NOT NULL DEFAULT 0,\ncity VARCHAR(20) DEFAULT (LEFT('unknown', 5)),  -- 8.0.13+ 表达式默认值",
        {
          note: true,
        },
      ),
      item('c-check', 'CHECK (amount >= 0 AND status IN (0,1,2)),  -- 8.0.16+ 才真正生效', {
        note: true,
      }),
      item(
        'c-show',
        `SHOW CREATE TABLE t;
SELECT * FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_NAME='t';
SELECT * FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_NAME='t' AND REFERENCED_TABLE_NAME IS NOT NULL;`,
      ),
    ],
  },
  {
    id: 'index',
    items: [
      item(
        'idx-create',
        `CREATE INDEX idx_uid ON \`order\` (uid);
ALTER TABLE \`order\` ADD INDEX idx_uid_time (uid, created_at);
CREATE UNIQUE INDEX uk_email ON user (email);
-- 删除
DROP INDEX idx_uid ON \`order\`;
ALTER TABLE \`order\` DROP INDEX idx_uid;`,
        { note: true },
      ),
      item(
        'idx-composite',
        `KEY idx_abc (a, b, c)
-- 最左前缀可用：a / a,b / a,b,c / a=1 AND c=1(只用 a)
-- 失效：WHERE b=1、WHERE c=1、范围列后的列不再用于查找`,
        { note: true },
      ),
      item(
        'idx-prefix',
        `ALTER TABLE t ADD INDEX idx_name (name(20));   -- 前缀索引，省空间
-- TEXT / BLOB 建索引必须给前缀长度
SELECT COUNT(DISTINCT LEFT(name,20))/COUNT(*) FROM t;  -- 先测区分度`,
        { note: true },
      ),
      item(
        'idx-covering',
        `KEY idx_cover (uid, status, amount)
SELECT uid, status, amount FROM \`order\` WHERE uid = 1;  -- Extra: Using index`,
        { note: true },
      ),
      item(
        'idx-fulltext',
        `ALTER TABLE article ADD FULLTEXT INDEX ft_title (title, content) WITH PARSER ngram;
SELECT id, MATCH(title, content) AGAINST('数据库' IN NATURAL LANGUAGE MODE) AS score
FROM article WHERE MATCH(title, content) AGAINST('数据库');
-- BOOLEAN MODE 支持 +word -word "phrase"`,
        { note: true, diff: true },
      ),
      item(
        'idx-spatial',
        'CREATE TABLE g (id INT PRIMARY KEY, p POINT NOT NULL SRID 4326, SPATIAL INDEX sp_idx (p));',
        {
          note: true,
        },
      ),
      item(
        'idx-function',
        `ALTER TABLE t ADD INDEX idx_email ((LOWER(email)));   -- 8.0.13+ 函数索引
ALTER TABLE t ADD INDEX idx_col ((CAST(JSON_EXTRACT(doc,'$.a') AS UNSIGNED)));`,
        { note: true, diff: true },
      ),
      item(
        'idx-partial',
        `-- MySQL 没有部分索引，用生成列变通
ALTER TABLE t ADD COLUMN active_flag TINYINT
  GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
  ADD INDEX idx_active (active_flag, uid);`,
        { diff: true },
      ),
      item(
        'idx-invisible',
        'ALTER TABLE t ALTER INDEX idx_x INVISIBLE;   -- 优化器不再用，可回滚\nALTER TABLE t ALTER INDEX idx_x VISIBLE;',
        {
          note: true,
        },
      ),
      item(
        'idx-show',
        `SHOW INDEX FROM t;
SELECT * FROM information_schema.STATISTICS WHERE TABLE_NAME='t';
SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, CARDINALITY
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE();
SELECT * FROM sys.schema_unused_indexes;   -- 从未被用到的索引`,
        { note: true },
      ),
      item(
        'idx-useless',
        `-- 索引失效清单
1 WHERE 列上套函数/运算：WHERE DATE(t)=... / WHERE id+1=2
2 隐式类型转换：varchar 列 WHERE code = 123
3 前置通配 LIKE '%x'
4 联合索引未遵守最左前缀
5 OR 连接非索引列
6 NOT / <> / != 大范围扫描
7 IS NULL / IS NOT NULL（视数据分布）
8 排序方向与索引相反、ORDER BY 混用 ASC DESC
9 区分度过低（如性别），优化器直接走全表
10 覆盖索引缺失导致大量回表
11 小表全表更快
12 统计信息过期：ANALYZE TABLE t`,
      ),
    ],
  },
  {
    id: 'view',
    items: [
      item(
        'v-create',
        `CREATE OR REPLACE VIEW v_active_user AS
SELECT id, name, city FROM user WHERE status = 1 AND deleted_at IS NULL;`,
      ),
      item('v-select', "SELECT * FROM v_active_user WHERE city = 'SH';  -- 像普通表一样用", {
        note: true,
      }),
      item(
        'v-algorithm',
        'CREATE ALGORITHM=MERGE VIEW v AS SELECT ...;\nCREATE SQL SECURITY INVOKER VIEW v AS SELECT ...;',
        {
          note: true,
        },
      ),
      item(
        'v-update',
        `-- 可更新视图限制：不含聚合/DISTINCT/GROUP BY/UNION/窗口函数/常量列
INSERT INTO v_active_user (id, name) VALUES (9, 'x');  -- 基表 status 非 1
CREATE OR REPLACE VIEW v AS SELECT ... WITH CHECK OPTION;  -- 拒绝越界写入`,
        { note: true },
      ),
      item('v-drop', 'DROP VIEW IF EXISTS v_active_user;', { note: true }),
      item(
        'v-materialized',
        `-- MySQL 无物化视图，用汇总表 + 触发器/定时任务，或生成列
CREATE TABLE stat_day AS SELECT DATE(create_time) d, COUNT(*) c FROM t GROUP BY d;`,
        { diff: true },
      ),
    ],
  },
  {
    id: 'txn',
    items: [
      item(
        'txn-basic',
        `START TRANSACTION;   -- 等价 BEGIN [WORK]
UPDATE account SET bal = bal - 100 WHERE id = 1;
UPDATE account SET bal = bal + 100 WHERE id = 2;
COMMIT;                -- 或 ROLLBACK;`,
        { note: true },
      ),
      item(
        'txn-savepoint',
        `START TRANSACTION;
INSERT INTO t VALUES (1);
SAVEPOINT sp1;
INSERT INTO t VALUES (2);
ROLLBACK TO SAVEPOINT sp1;   -- 只回滚 sp1 之后的部分
COMMIT;
RELEASE SAVEPOINT sp1;`,
      ),
      item(
        'txn-autocommit',
        `SELECT @@autocommit;          -- 默认 1：每条语句自成一个事务
SET autocommit = 0;
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION WITH CONSISTENT SNAPSHOT;`,
        { note: true },
      ),
      item(
        'txn-isolation',
        `SET TRANSACTION ISOLATION LEVEL
  READ UNCOMMITTED | READ COMMITTED | REPEATABLE READ | SERIALIZABLE;
SELECT @@transaction_isolation;
-- 脏读 / 不可重复读 / 幻读 依次被更高级别排除`,
        { note: true },
      ),
      item(
        'txn-for-update',
        `SELECT * FROM account WHERE id = 1 FOR UPDATE;        -- 排他锁
SELECT * FROM account WHERE id = 1 FOR SHARE;        -- 共享锁（LOCK IN SHARE MODE）
SELECT ... FOR UPDATE NOWAIT;              -- 拿不到锁立即报错
SELECT ... FOR UPDATE SKIP LOCKED;         -- 跳过被锁行，做队列`,
        { note: true },
      ),
      item(
        'txn-optimistic',
        `-- 乐观锁：版本号比对
UPDATE stock SET qty = qty - 1, ver = ver + 1
WHERE id = 1 AND qty >= 1 AND ver = 7;   -- 检查影响行数是否为 1`,
      ),
      item(
        'txn-implicit',
        'ALTER TABLE / CREATE TABLE / DROP / TRUNCATE / RENAME / LOAD DATA /\nSET autocommit / 锁操作 都会隐式提交当前事务',
        {
          note: true,
        },
      ),
      item(
        'txn-deadlock',
        `SELECT * FROM information_schema.INNODB_TRX;
SHOW ENGINE INNODB STATUS;      -- LATEST DETECTED DEADLOCK 段
SELECT * FROM performance_schema.data_lock_waits;
SELECT * FROM sys.innodb_lock_waits;
SET GLOBAL innodb_print_all_deadlocks = ON;`,
        { note: true },
      ),
      item(
        'txn-long',
        `-- 长事务危害：undo 膨胀、MVCC 读旧版本变慢、锁堆积、DDL 被堵
SELECT trx_id, trx_started, trx_mysql_thread_id, trx_query
FROM information_schema.INNODB_TRX ORDER BY trx_started LIMIT 10;
KILL <thread_id>;`,
      ),
      item(
        'txn-mvcc',
        "SELECT @@innodb_lock_wait_timeout, @@transaction_isolation;\nSHOW VARIABLES LIKE 'innodb_stats_persistent%'",
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'dcl',
    items: [
      item(
        'dcl-user',
        `CREATE USER 'app'@'10.0.0.%' IDENTIFIED BY 'Strong#Pwd1';
CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED WITH caching_sha2_password BY 'x';
ALTER USER 'app'@'%' IDENTIFIED BY 'NewPwd#1';
RENAME USER 'app'@'%' TO 'app2'@'%';
DROP USER IF EXISTS 'app'@'%';`,
        { note: true },
      ),
      item(
        'dcl-grant',
        `GRANT SELECT, INSERT ON mydb.\`order\` TO 'app'@'%';
GRANT ALL PRIVILEGES ON mydb.* TO 'app'@'%';
GRANT SELECT ON *.* TO 'ro'@'%' WITH GRANT OPTION;
SHOW GRANTS FOR 'app'@'%';`,
        { note: true },
      ),
      item(
        'dcl-revoke',
        "REVOKE INSERT ON mydb.* FROM 'app'@'%';\nREVOKE ALL PRIVILEGES, GRANT OPTION FROM 'app'@'%';",
      ),
      item(
        'dcl-role',
        "CREATE ROLE reader;\nGRANT SELECT ON mydb.* TO reader;\nGRANT reader TO 'app'@'%';\nSET DEFAULT ROLE ALL TO 'app'@'%';",
        {
          note: true,
        },
      ),
      item('dcl-flush', 'FLUSH PRIVILEGES;   -- 直接改了 mysql.* 表才需要；正常 GRANT 不必', {
        note: true,
      }),
      item(
        'dcl-limit',
        `ALTER USER 'app'@'%' WITH
  MAX_CONNECTIONS_PER_HOUR 100
  MAX_USER_CONNECTIONS 20
  PASSWORD EXPIRE INTERVAL 180 DAY
  FAILED_LOGIN_ATTEMPTS 3 PASSWORD_LOCK_TIME 2;
ALTER USER 'app'@'%' ACCOUNT LOCK;   -- / ACCOUNT UNLOCK`,
      ),
      item(
        'dcl-pwd-policy',
        "SHOW VARIABLES LIKE 'validate_password%';\nSET GLOBAL validate_password.policy = MEDIUM;  -- 组件 INSTALL COMPONENT ...",
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'routine',
    items: [
      item(
        'r-delimiter',
        `DELIMITER $$
-- 定义体内用 ; 分隔语句，结尾用 $$
DELIMITER ;`,
        { note: true },
      ),
      item(
        'r-procedure',
        `CREATE PROCEDURE sp_user_orders(IN p_uid BIGINT, OUT p_cnt INT)
BEGIN
  SELECT COUNT(*) INTO p_cnt FROM orders WHERE uid = p_uid;
  SELECT * FROM orders WHERE uid = p_uid ORDER BY id DESC LIMIT 10;
END$$
CALL sp_user_orders(1, @n);
SELECT @n;
DROP PROCEDURE IF EXISTS sp_user_orders;`,
        { note: true },
      ),
      item(
        'r-function',
        `CREATE FUNCTION fn_status_text(p INT) RETURNS VARCHAR(10) DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE r VARCHAR(10);
  SET r = CASE p WHEN 0 THEN 'new' WHEN 1 THEN 'paid' ELSE 'other' END;
  RETURN r;
END$$`,
        { note: true },
      ),
      item(
        'r-trigger',
        `CREATE TRIGGER trg_order_after_update
AFTER UPDATE ON orders FOR EACH ROW
BEGIN
  INSERT INTO order_log (oid, old_status, new_status, changed_at)
  VALUES (NEW.id, OLD.status, NEW.status, NOW());
END$$
DROP TRIGGER IF EXISTS trg_order_after_update;
SHOW TRIGGERS LIKE 'orders';`,
        { note: true },
      ),
      item(
        'r-cursor',
        `DECLARE done INT DEFAULT 0;
DECLARE v_id BIGINT;
DECLARE cur CURSOR FOR SELECT id FROM t WHERE status = 0;
DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
OPEN cur;
loop1: LOOP
  FETCH cur INTO v_id;
  IF done THEN LEAVE loop1; END IF;
  UPDATE t SET status = 1 WHERE id = v_id;
END LOOP;
CLOSE cur;`,
        { note: true },
      ),
      item(
        'r-vars',
        `DECLARE x INT DEFAULT 1;      -- 局部变量（BEGIN 内）
SET @y = 2;                    -- 会话变量，跨语句
SELECT @@version;              -- 系统变量
SELECT x, @y, @@sql_mode;`,
        { note: true },
      ),
      item(
        'r-event',
        'SET GLOBAL event_scheduler = ON;\nCREATE EVENT ev_clean ON SCHEDULE EVERY 1 DAY DO DELETE FROM logs WHERE created_at < NOW() - INTERVAL 30 DAY;',
        {
          note: true,
        },
      ),
      item(
        'r-show',
        'SHOW PROCEDURE STATUS WHERE Db = DATABASE();\nSHOW CREATE PROCEDURE sp_user_orders;\nSELECT * FROM information_schema.ROUTINES;',
      ),
    ],
  },
  {
    id: 'meta',
    items: [
      item(
        'm-show',
        "SHOW DATABASES;\nSHOW TABLES LIKE 'user%';\nSHOW FULL TABLES;              -- 附带 BASE TABLE / VIEW\nUSE mydb;",
      ),
      item(
        'm-structure',
        `DESC user;                      -- 等价 DESCRIBE / EXPLAIN user
SHOW CREATE TABLE user;             -- 完整建表语句，含索引
SHOW FULL COLUMNS FROM user;        -- 带注释与字符集
SHOW INDEX FROM user;
SHOW TABLE STATUS LIKE 'user';      -- 引擎/行数/碎片`,
      ),
      item(
        'm-cols',
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user';`,
      ),
      item(
        'm-size',
        `SELECT TABLE_NAME,
       TABLE_ROWS,
       ROUND(DATA_LENGTH/1024/1024,1) AS data_mb,
       ROUND(INDEX_LENGTH/1024/1024,1) AS idx_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC;`,
        { note: true },
      ),
      item(
        'm-session',
        `SELECT DATABASE(), CURRENT_USER(), VERSION();
SHOW PROCESSLIST;                 -- 或 information_schema.PROCESSLIST
SELECT * FROM information_schema.PROCESSLIST WHERE TIME > 5;
KILL 12345;                       -- 断连接；KILL QUERY 12345 只杀当前语句`,
        { note: true },
      ),
      item(
        'm-vars',
        "SHOW VARIABLES LIKE '%timeout%';\nSHOW GLOBAL VARIABLES LIKE 'max_connections';\nSET GLOBAL max_connections = 500;",
      ),
      item(
        'm-status',
        "SHOW GLOBAL STATUS LIKE 'Threads%';\nSHOW STATUS LIKE 'Com_select';\nSHOW STATUS LIKE 'Innodb_row_lock%'",
      ),
      item(
        'm-engines',
        "SHOW ENGINES;\nSHOW CHARACTER SET;\nSHOW COLLATION WHERE Charset = 'utf8mb4';",
      ),
      item(
        'm-search-schema',
        "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS\nWHERE TABLE_SCHEMA = 'mydb' AND COLUMN_NAME LIKE '%phone%';",
      ),
      item(
        'm-fk-check',
        'SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, CONSTRAINT_NAME\nFROM information_schema.KEY_COLUMN_USAGE\nWHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL;',
      ),
    ],
  },
  {
    id: 'perf',
    items: [
      item(
        'p-explain',
        `EXPLAIN SELECT ...;
EXPLAIN FORMAT=JSON SELECT ...;       -- 成本与嵌套细节
EXPLAIN FORMAT=TREE SELECT ...;       -- 8.0.18+ 可读树
EXPLAIN ANALYZE SELECT ...;           -- 真执行，给实际耗时与行数`,
        { note: true },
      ),
      item(
        'p-type',
        `type 从好到差：
system > const > eq_ref > ref > fulltext > ref_or_null >
  index_merge > unique_subquery > index_subquery > range > index > ALL
const     主键/唯一等值，最多 1 行
eq_ref    联表时主键等值
ref       非唯一索引等值
range     索引范围扫描（BETWEEN / IN / 前缀 LIKE）
index     全索引扫描
ALL       全表扫描，必须消除`,
      ),
      item(
        'p-cols',
        `possible_keys  候选索引
key            实际用的索引（NULL = 没走）
key_len        用到的索引字节长度，判断联合索引用了几列
rows           预估扫描行数（越小越好）
filtered       过滤后剩余百分比
Extra          Using index（覆盖） / Using where /
               Using filesort（额外排序，坏） /
               Using temporary（临时表，坏） /
               Using index condition（ICP 下推）`,
      ),
      item(
        'p-page',
        `-- 深分页慢：LIMIT 1000000, 20 要扫过 100 万行
SELECT * FROM t WHERE id > 1000000 ORDER BY id LIMIT 20;   -- 游标式
SELECT t.* FROM t JOIN (SELECT id FROM t ORDER BY c LIMIT 1000000, 20) x USING (id);  -- 延迟关联`,
        { note: true },
      ),
      item(
        'p-count',
        `SELECT COUNT(*) FROM t;                       -- InnoDB 必须扫
SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_NAME='t';  -- 估算值
SELECT COUNT(*) FROM t FORCE INDEX(idx);        -- 选最小的二级索引扫
-- 分区表用 EXPLAIN PARTITIONS 确认只扫目标分区`,
      ),
      item(
        'p-batch',
        `INSERT INTO t (a,b) VALUES (1,1),(2,2),...;   -- 一条语句多值，批量 500~1000
LOAD DATA LOCAL INFILE 'f.csv' INTO TABLE t ...;  -- 最快
-- 关闭自动提交、减少索引、禁用唯一检查（谨慎）可加速导入`,
        { note: true },
      ),
      item(
        'p-slowlog',
        "SHOW VARIABLES LIKE 'slow_query_log%';\nSHOW VARIABLES LIKE 'long_query_time';\nSET GLOBAL slow_query_log = ON;\nSET GLOBAL long_query_time = 1;\nSET GLOBAL log_queries_not_using_indexes = ON;",
      ),
      item(
        'p-analyze',
        'ANALYZE TABLE t;         -- 重新统计信息\nOPTIMIZE TABLE t;         -- 回收碎片（InnoDB 走 ALGORITHM=INPLACE）\nCHECK TABLE t;',
        { note: true },
      ),
      item(
        'p-hint',
        `SELECT /*+ JOIN_ORDER(a, b) */ ...;
SELECT STRAIGHT_JOIN ...;              -- 强制左表为驱动表
SELECT SQL_NO_CACHE ...;               -- 跳过查询缓存遗留写法
FORCE INDEX (idx_uid) / IGNORE INDEX (idx_x) / USE INDEX (idx_y)`,
        { note: true },
      ),
      item(
        'p-rules',
        `1 只查需要的列，禁止 SELECT *
2 WHERE 条件列建索引，等值列放联合索引左侧
3 用 EXPLAIN 验证：不出现 ALL / filesort / temporary
4 索引列上不套函数、不做运算、不隐式转换
5 大范围分页用游标或延迟关联
6 大批量写拆分成小事务
7 高区分度列放前，冗余索引及时删
8 排序列与索引顺序一致，避免 Using filesort
9 覆盖索引减少回表
10 统计信息定期 ANALYZE，慢日志常态化巡检`,
      ),
      item(
        'p-stat',
        "SELECT * FROM mysql.innodb_table_stats WHERE table_name='t';\nSELECT * FROM mysql.innodb_index_stats WHERE table_name = 't';\nSHOW VARIABLES LIKE 'innodb_stats_persistent%';",
      ),
    ],
  },
  {
    id: 'backup',
    items: [
      item(
        'b-dump',
        `mysqldump -h127.0.0.1 -P3306 -uroot -p mydb > mydb.sql
mysqldump -uroot -p --databases mydb t1 t2 > part.sql
mysqldump -uroot -p --all-databases --routines --triggers --events > all.sql
mysqldump -uroot -p --no-data mydb > schema.sql      -- 只导结构
mysqldump -uroot -p --no-create-info mydb > data.sql -- 只导数据`,
        { note: true },
      ),
      item(
        'b-consistent',
        'mysqldump -uroot -p --single-transaction --master-data=2 --routines mydb > mydb.sql',
        {
          note: true,
        },
      ),
      item(
        'b-import',
        `mysql -uroot -p mydb < mydb.sql
mysql -uroot -p -e "source /tmp/mydb.sql"
gunzip < mydb.sql.gz | mysql -uroot -p mydb`,
      ),
      item(
        'b-export-csv',
        "SELECT * FROM t INTO OUTFILE '/var/lib/mysql-files/t.csv'\nFIELDS TERMINATED BY ',' ENCLOSED BY '\"' LINES TERMINATED BY '\\n';",
        {
          note: true,
        },
      ),
      item(
        'b-user-grants',
        'mysqldump -uroot -p mysql user db table column procs priv > users.sql',
        {
          note: true,
        },
      ),
      item(
        'b-binlog',
        'SHOW BINARY LOGS;\nSHOW BINLOG EVENTS IN \'binlog.000042\' LIMIT 20;\nmysqlbinlog --start-datetime="2026-09-27 10:00:00" --stop-datetime="2026-09-27 11:00:00" binlog.000042 > p.sql\nmysqlbinlog --database=mydb binlog.000042 | mysql -uroot -p',
        {
          note: true,
        },
      ),
      item(
        'b-login-client',
        'mysql --defaults-extra-file=/tmp/my.cnf -e "SELECT 1"\nmysql -h db.host -P 3306 -u app -p --get-server-public-key --ssl-mode=REQUIRED',
      ),
      item(
        'b-restore-table',
        'RENAME TABLE t TO t_broken;  -- 先隔离\nsource /tmp/t.sql               -- 再导入备份\n-- 或用可传输表空间：DISCARD/IMPORT TABLESPACE',
        {
          note: true,
        },
      ),
    ],
  },
  {
    id: 'dialect',
    items: [
      item(
        'd-paging',
        `-- MySQL / PostgreSQL / SQLite
SELECT * FROM t ORDER BY id LIMIT 10 OFFSET 20;
-- SQL Server 2012+ / Oracle 12c+ / PostgreSQL（SQL:2008 标准式）
SELECT * FROM t ORDER BY id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;
-- SQL Server
SELECT TOP (10) * FROM t ORDER BY id;
-- Oracle 旧式（ROWNUM 在排序前赋值，必须三层嵌套）
SELECT * FROM (SELECT a.*, ROWNUM r FROM
  (SELECT * FROM t ORDER BY id) a WHERE ROWNUM <= 30) WHERE r > 20;`,
        { note: true },
      ),
      item(
        'd-autoincrement',
        `-- MySQL
id INT AUTO_INCREMENT PRIMARY KEY
-- PostgreSQL（推荐标准写法，旧式 serial / bigserial）
id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
-- SQL Server
id int IDENTITY(1,1) PRIMARY KEY
-- Oracle 12c+
id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
-- 取新主键：MySQL LAST_INSERT_ID() / PG·Oracle RETURNING / SQL Server OUTPUT+SCOPE_IDENTITY()`,
        { note: true },
      ),
      item(
        'd-upsert',
        `-- MySQL
INSERT INTO t (id,name) VALUES (1,'a')
ON DUPLICATE KEY UPDATE name = VALUES(name);         -- 8.0.20 起弃用
INSERT INTO t (id,name) VALUES (1,'a') AS new
ON DUPLICATE KEY UPDATE name = new.name;             -- 8.0.19+
-- PostgreSQL（冲突目标必须写清）
INSERT INTO t (id,name) VALUES (1,'a')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO t (id,name) VALUES (1,'a') ON CONFLICT (id) DO NOTHING;
-- SQL Server / Oracle
MERGE INTO t USING s ON t.id = s.id
 WHEN MATCHED THEN UPDATE SET t.name = s.name
 WHEN NOT MATCHED THEN INSERT (id,name) VALUES (s.id,s.name);`,
        { note: true },
      ),
      item(
        'd-returning',
        `-- PostgreSQL 9.1+ / SQLite 3.35+：写后即读
INSERT INTO users (name) VALUES ('a') RETURNING id;
UPDATE t SET v = v + 1 WHERE id = 1 RETURNING *;
-- SQL Server：没有 RETURNING，用 OUTPUT
INSERT INTO t (name) OUTPUT INSERTED.id VALUES ('a');
DELETE FROM t OUTPUT DELETED.* WHERE id = 1;
-- MySQL：不支持，只能二次查询 SELECT LAST_INSERT_ID()`,
      ),
      item(
        'd-concat',
        `-- MySQL
SELECT CONCAT(a, '-', b);     -- 任一参数 NULL 则整体 NULL；|| 默认是逻辑 OR
-- PostgreSQL / Oracle / SQL Server 2012+
SELECT a || '-' || b;         -- PG: NULL 传播；Oracle: NULL 当空串
SELECT CONCAT(a, '-', b);     -- SQL Server 2012+ 忽略 NULL；+ 遇 NULL 即 NULL
-- SQL Server 老写法
SELECT CAST(a AS VARCHAR(50)) + ISNULL(b, '')`,
        { note: true },
      ),
      item(
        'd-quote',
        `-- 字符串统一用单引号，内部单引号写两个 ''
-- 标识符（表/列名）各家不同：
SELECT \`col\` FROM \`tbl\`      -- MySQL 反引号
SELECT "col" FROM "tbl"       -- PostgreSQL / Oracle（PG 折叠小写、Oracle 折叠大写）
SELECT [col] FROM [tbl]       -- SQL Server 方括号
-- 字符串前缀 N'' 在 SQL Server 表示 Unicode（NVARCHAR），Oracle 同理`,
        { note: true },
      ),
      item(
        'd-now',
        `-- MySQL
SELECT NOW(), CURDATE(), UTC_TIMESTAMP();
-- PostgreSQL
SELECT now(), current_date, clock_timestamp();   -- now() 取事务开始时刻
-- SQL Server
SELECT GETDATE(), SYSDATETIME(), SYSUTCDATETIME(), CURRENT_TIMESTAMP;
-- Oracle
SELECT SYSDATE, SYSTIMESTAMP, CURRENT_TIMESTAMP FROM dual;`,
      ),
      item(
        'd-dateformat',
        `-- MySQL
SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'), STR_TO_DATE('2026-09-27','%Y-%m-%d');
-- PostgreSQL / Oracle
SELECT to_char(now(),'YYYY-MM-DD HH24:MI:SS'), to_date('2026-09-27','YYYY-MM-DD');
-- SQL Server
SELECT FORMAT(GETDATE(),'yyyy-MM-dd'), CONVERT(varchar(19), GETDATE(), 120);
-- 日期加减
SELECT NOW() + INTERVAL 1 MONTH;             -- MySQL
SELECT now() + INTERVAL '1 month';           -- PostgreSQL
SELECT DATEADD(MONTH, 1, GETDATE());         -- SQL Server
SELECT ADD_MONTHS(SYSDATE, 1);               -- Oracle`,
        { note: true },
      ),
      item(
        'd-null-func',
        `-- 全通用（首选）
SELECT COALESCE(a, b, 0), NULLIF(a, b), CASE WHEN a IS NULL THEN 0 ELSE a END
-- MySQL
SELECT IFNULL(a, 0), IF(a > 1, 'x', 'y'), ISNULL(a)
-- Oracle
SELECT NVL(a, 0), NVL2(a, 'has', 'null'), DECODE(a, 1, 'x', 'y')
-- SQL Server
SELECT ISNULL(a, 0), IIF(a > 1, 'x', 'y')`,
      ),
      item(
        'd-cast',
        `-- 标准写法四库通用
SELECT CAST(x AS DECIMAL(10,2))
-- PostgreSQL 惯用 ::
SELECT x::numeric(10,2), x::text, x::date
-- MySQL：CONVERT(表达式, 类型)
SELECT CONVERT(x, DECIMAL(10,2)), CONVERT(x USING utf8mb4)
-- SQL Server：CONVERT(类型, 表达式, style)，类型在前
SELECT CONVERT(varchar(10), x), CONVERT(varchar(10), GETDATE(), 120)`,
        { note: true },
      ),
      item(
        'd-regex',
        `-- MySQL
WHERE col REGEXP '^[0-9]+$'      -- 同义 RLIKE
SELECT REGEXP_REPLACE(col, '[a-z]', '#')   -- 8.0.4+
-- PostgreSQL
WHERE col ~  '^[0-9]+$'      -- 区分大小写
WHERE col ~* '^[0-9]+$'      -- 不区分；!~ / !~* 取反
WHERE col ILIKE 'abc%'       -- 不区分大小写的 LIKE
-- Oracle
WHERE REGEXP_LIKE(col, '^[0-9]+$', 'i')
-- SQL Server：无原生正则，用 LIKE + PATINDEX('%[0-9]%', col) 或 CLR`,
      ),
      item(
        'd-json',
        `-- MySQL
SELECT doc->>'$.uid', JSON_CONTAINS(doc, '1', '$.ids'), JSON_TABLE(...)
-- PostgreSQL（jsonb 才有操作符与 GIN 索引）
SELECT doc->>'uid', doc @> '{"a":1}', doc ? 'a', doc #- '{a,b}',
       jsonb_path_query(doc, '$.a[*] ? (@ > 1)')
-- SQL Server（无 json 列类型，存 varchar/nvarchar）
SELECT JSON_VALUE(doc,'$.uid'), JSON_QUERY(doc,'$.arr'),
       * FROM OPENJSON(doc) WITH (id int '$.id')
-- Oracle
SELECT JSON_VALUE(doc,'$.uid'), * FROM JSON_TABLE(doc, '$' COLUMNS(...))`,
        { note: true },
      ),
      item(
        'd-alter',
        `-- 一次改多列
ALTER TABLE t ADD a INT, MODIFY b VARCHAR(20), DROP c;   -- MySQL 逗号分隔
ALTER TABLE t ADD a int, ALTER COLUMN b TYPE varchar(20), DROP c;  -- PG 逗号，RENAME 需单独一条
ALTER TABLE t ALTER COLUMN b TYPE varchar(20) USING upper(b);      -- PG 需 USING
ALTER TABLE t ADD a int; ALTER TABLE t ALTER COLUMN b ...;         -- SQL Server 一条一个动作
ALTER TABLE t MODIFY (b VARCHAR2(20), c NUMBER);                   -- Oracle 括号内多列
-- 改列名
ALTER TABLE t CHANGE old new INT;    -- MySQL
ALTER TABLE t RENAME COLUMN a TO b;  -- MySQL 8.0.3+ / PG / Oracle
EXEC sp_rename 't.a','b','COLUMN';   -- SQL Server（官方不推荐）`,
        { note: true },
      ),
      item(
        'd-support',
        `-- 能力支持矩阵（√ 支持 / 版本 = 起始版本）
能力             MySQL        PostgreSQL   SQL Server   Oracle
窗口函数         8.0          9.2          2012         9i
CTE / 递归 CTE   8.0          8.4 / 8.4    2005         11.2
INTERSECT/EXCEPT 8.0.31       √            √            √
CHECK 约束       8.0.16       √            √            √
JSON 列类型      5.7          json/jsonb   2025(之前varchar)  √
部分/条件索引    ×(生成列变通) √ WHERE      √ filtered  ×
IF [NOT] EXISTS  部分支持     √            ×            ×
RETURNING        ×            √            OUTPUT       √
MERGE            ×            15+          2008+        9i+`,
      ),
      item(
        'd-mysql8',
        `-- MySQL 5.7 → 8.0 破坏性变化清单
1 默认认证插件改 caching_sha2_password，老驱动报 "plugin cannot be loaded"
2 默认字符集 latin1 → utf8mb4，默认排序规则 utf8mb4_0900_ai_ci
3 查询缓存整体移除：SQL_CACHE / SQL_NO_CACHE / query_cache_* 全部失效
4 默认 sql_mode 含 ONLY_FULL_GROUP_BY，旧写法报 1055
5 新增保留字 RANK / GROUPS / OVER / WINDOW / LATERAL / RECURSIVE ... 需反引号
6 GROUP BY 不再隐式排序，也不支持 GROUP BY ... ASC/DESC
7 整型显示宽度与 ZEROFILL 弃用（int(11) 的 11 与范围无关）
8 删除 PASSWORD() / ENCRYPT()，GRANT ... IDENTIFIED BY 不再隐式建用户
9 重启不再丢失 AUTO_INCREMENT 计数（5.7 会回退到 max+1）
10 utf8 成为 utf8mb3 别名并计划弃用
11 CHECK 约束自 8.0.16 起真正生效，老库脏数据会导致加约束失败
12 EXPLAIN 不再默认显示 partitions；派生表合并策略变化可能引入新报错`,
      ),
    ],
  },
  {
    id: 'postgres',
    items: [
      item(
        'pg-psql',
        `psql -U postgres -h 127.0.0.1 -p 5432 -d demo
\\l+        列数据库      \\dt+   列表      \\d+ 表名   看表结构
\\du        列角色        \\di    列索引    \\dn    列模式
\\x auto    竖排输出      \\i file.sql   执行脚本   \\conninfo
pg_dump -Fc -f db.backup demo
pg_restore -d newdb --clean --if-exists db.backup`,
      ),
      item(
        'pg-admin',
        `CREATE ROLE app LOGIN PASSWORD 'Strong#Pwd1';
CREATE DATABASE demo OWNER app ENCODING 'UTF8' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE demo TO app;
GRANT USAGE ON SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app;
ALTER USER postgres PASSWORD 'Another#Pwd1';`,
        { note: true },
      ),
      item(
        'pg-types',
        `id BIGSERIAL / id bigint GENERATED ALWAYS AS IDENTITY
serial / bigserial       -- 隐藏 sequence 的简写
NUMERIC(12,2) / MONEY / BOOLEAN
TEXT                     -- PG 的 TEXT 无长度惩罚，常用它代替 VARCHAR
UUID / JSONB / ARRAY[] / INET / CIDR / TSVECTOR / BYTEA
INTERVAL / DATE(无时区) / TIMESTAMPTZ / TIME
SELECT nextval('t_id_seq'), currval('t_id_seq'), setval('t_id_seq', 100);`,
      ),
      item(
        'pg-syntax',
        `SELECT 'a' || 'b'                     -- 拼接（NULL 会传播）
WHERE name ILIKE 'zh%'                  -- 大小写不敏感 LIKE
WHERE tags @> ARRAY['x']                -- 数组包含
LIMIT ALL OFFSET 20                     -- 只跳不取
DISTINCT ON (uid) * ... ORDER BY uid, id DESC   -- 每组取一行
generate_series(1, 10) / generate_series(ts1, ts2, '1 day')
INSERT ... RETURNING id
UPDATE t SET v = v + 1 FROM s WHERE t.id = s.id   -- UPDATE ... FROM`,
        { note: true },
      ),
      item(
        'pg-index',
        `CREATE INDEX CONCURRENTLY idx_x ON t (x);   -- 不锁写，失败留 INVALID 需重建
CREATE UNIQUE INDEX ON t (lower(email));         -- 表达式索引
CREATE INDEX ON t USING GIN (doc jsonb_path_ops);
CREATE INDEX ON t USING BRIN (created_at);       -- 超大有序表
CREATE INDEX ON t (uid) WHERE deleted_at IS NULL;  -- 部分索引
DROP INDEX CONCURRENTLY IF EXISTS idx_x;`,
        { note: true },
      ),
      item(
        'pg-conf',
        `# postgresql.conf：listen_addresses='*'、port、max_connections、
# shared_buffers、work_mem、TimeZone、password_encryption='scram-sha-256'
# pg_hba.conf 追加一行才允许远程密码登录：
host  all  all  0.0.0.0/0  scram-sha-256
SELECT pg_reload_conf();
SELECT name, setting, pending_restart FROM pg_settings WHERE pending_restart;`,
        { note: true },
      ),
      item(
        'pg-docker',
        `# ≤ 17：必须挂到 /var/lib/postgresql/data 并用嵌套 PGDATA
docker run -d --name pg17 -p 5432:5432 \\
  -e POSTGRES_PASSWORD=Strong#Pwd1 -e POSTGRES_DB=demo \\
  -e PGDATA=/var/lib/postgresql/data/pgdata \\
  -v pg-data:/var/lib/postgresql/data postgres:17
# 18+：官方把 VOLUME 改成 /var/lib/postgresql，不再需要嵌套
docker run -d --name pg18 -v pg18-data:/var/lib/postgresql -e POSTGRES_PASSWORD=x postgres:18
docker exec -it pg17 psql -U postgres
# 首次启动执行的初始化脚本目录
-v ./initdb:/docker-entrypoint-initdb.d:ro`,
        { note: true },
      ),
      item(
        'pg-maintain',
        `VACUUM (ANALYZE, VERBOSE) t;         -- 回收死元组 + 更新统计
ANALYZE t;
REINDEX INDEX idx_x / REINDEX TABLE t;    -- 重建索引（CONCURRENTLY 可用）
SELECT pg_size_pretty(pg_total_relation_size('t'));
SELECT * FROM pg_stat_activity WHERE state <> 'idle';
SELECT pid, pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...;
CREATE INDEX CONCURRENTLY ... ;  -- 大表在线建索引`,
        { note: true },
      ),
      item(
        'pg-pitfalls',
        `-- 1 quote_identifier：未加引号的标识符折叠为小写，"Foo" 与 foo 是两个对象
-- 2 事务里报错必须 ROLLBACK 或 SAVEPOINT，否则后续语句全被拒
BEGIN; ... ; ROLLBACK TO SAVEPOINT sp;
-- 3 字符串字面量默认不处理反斜杠（standard_conforming_strings=on），要转义用 E'\\n'
-- 4 远程连不上排查顺序：listen_addresses → pg_hba.conf → 防火墙端口
-- 5 锁子句不能与 DISTINCT / GROUP BY / UNION 同层使用
-- 6 Docker 改了环境变量不生效：数据卷非空时 env 与 initdb 脚本都不再执行`,
      ),
    ],
  },
  {
    id: 'practice',
    items: [
      item(
        'sec-injection',
        `-- 危险：把用户输入拼进 SQL
String sql = "SELECT * FROM user WHERE name = '" + name + "'";
// 输入 ' OR '1'='1' --  即变成全表；输入 '; DROP TABLE user;--  更糟
-- 正确：参数化占位符，驱动自己做转义
PreparedStatement ps = conn.prepareStatement(
  "SELECT * FROM user WHERE name = ?");
ps.setString(1, name);`,
        { note: true },
      ),
      item(
        'sec-framework',
        `-- MyBatis：#{} 预编译占位符（安全），\${} 直接字符串拼接（危险）
WHERE name = #{name}          -- OK
ORDER BY \${col}               -- 白名单校验后才可用
WHERE id IN (\${@com.x.Util@join(ids)})  -- 自研工具类需严格校验
-- ORM 也要防二次注入：动态表名/列名/排序字段永远走白名单`,
        { note: true },
      ),
      item(
        'sec-minimal',
        `-- 应用账号只给必要权限，禁止给 root/DROP/GRANT OPTION
GRANT SELECT, INSERT, UPDATE ON app_db.* TO 'app'@'10.0.0.%';
-- 报表账号只读、限来源 IP、限连接数
CREATE USER 'report'@'10.0.0.%' IDENTIFIED BY '...';
ALTER USER 'report'@'10.0.0.%' WITH MAX_USER_CONNECTIONS 5;`,
      ),
      item(
        'pr-table',
        `-- 建表规范
1 表/列名小写 snake_case，不用复数、不用保留字、不加tbl_前缀
2 必须有主键（BIGINT 自增或雪花 id），必须有 created_at / updated_at
3 字段一律 NOT NULL + 合理默认值，用 0/'' 代替 NULL
4 金额用 DECIMAL，状态用 TINYINT，布尔用 TINYINT(1)，长文本才用 TEXT
5 varchar 长度按需，utf8mb4 下索引列超 191 字符需前缀索引
6 单表列数 < 40、行宽可控，禁止在库里存图片二进制
7 每列写 COMMENT，表写 COMMENT，逻辑删除用 deleted_at 而非 is_deleted 字符串`,
      ),
      item(
        'pr-index',
        `-- 索引规范
1 联合索引区分度高的列在前，等值列在范围列之前
2 单表索引控制在 5 个以内，禁止冗余索引（有 (a,b) 就别建 (a)）
3 用 EXPLAIN 验证，不接受 type=ALL / Using filesort / Using temporary
4 排序、分组、连接列都要有索引支撑
5 前缀索引取区分度 90%+ 的最短长度
6 覆盖索引避免回表；不在索引列上做运算
7 删除索引前用 sys.schema_unused_indexes / 不可见索引观察一周`,
      ),
      item(
        'pr-sql',
        `-- SQL 编写规范
1 禁止 SELECT *，列表显式给出
2 时间条件用半开区间 >= 起 AND < 次日起，不要 BETWEEN 带时分秒
3 分页必须带唯一列排序，深分页用游标 or 延迟关联
4 大批量写拆分小事务（每批 500~1000 行）
5 用 EXISTS 代替 IN (子查询) 处理大结果集；NOT IN 前先排除 NULL
6 更新/删除前先 SELECT 确认影响范围，WHERE 条件不能全表
7 不在业务高峰跑 DDL 与全表统计；DDL 上线走审核 + 在线改表工具`,
      ),
      item(
        'pr-change',
        `-- 线上改表流程
SELECT VERSION(); SHOW CREATE TABLE t\\G   -- 1 先确认结构与体积
-- 2 估算成本：能否 ALGORITHM=INSTANT / INPLACE + LOCK=NONE
ALTER TABLE t ADD COLUMN x INT NULL, ALGORITHM=INSTANT;
ALTER TABLE t ADD INDEX idx_x (x), ALGORITHM=INPLACE, LOCK=NONE;
-- 3 大表用 pt-online-schema-change 或 gh-ost
pt-online-schema-change --alter "ADD COLUMN x INT" D=app,t=t --execute
-- 4 影子表原子切换：建 t_new → 双写/回补 → RENAME TABLE t TO t_old, t_new TO t
-- 5 先加约束后校验：PG 用 NOT VALID + VALIDATE CONSTRAINT 避免长时锁表`,
        { note: true },
      ),
      item(
        'pr-design',
        `-- 软删除与审计
deleted_at DATETIME NULL,               -- 查询固定带 IS NULL，索引也要带上它
UNIQUE KEY uk_email (email, deleted_at) -- 允许软删后重新注册（NULL 不参与唯一）
created_by BIGINT, updated_by BIGINT, version INT DEFAULT 0  -- 乐观锁版本
-- 范式与反范式：3 NF 为基线，统计/报表场景允许冗余字段 + 定时任务补偿
-- 分库分表：优先单表优化（索引/分区/冷热分离），量级到亿再上中间件`,
        { note: true },
      ),
    ],
  },
]
