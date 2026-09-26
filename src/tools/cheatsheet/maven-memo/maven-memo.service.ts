import type { InstallGuideStep } from '@/utils/install-guide'

export interface MavenMemoItem {
  /** mvn 命令或 pom/settings.xml 配置片段（展示与复制用） */
  command: string
  /** i18n 键：tools-cheatsheet 命名空间下 maven-memo.<descriptionKey> */
  descriptionKey: string
}

export interface MavenMemoGroup {
  id: string
  items: MavenMemoItem[]
}

function item(command: string, key: string): MavenMemoItem {
  return { command, descriptionKey: `item-${key}` }
}

const EXTRACT_DIR = 'D:\\Apache\\apache-maven-3.9.11'

/** Maven 安装引导（Windows）：下载 → 解压 → 环境变量 → 验证 → settings.xml → IDEA */
export const mavenInstallGuide: readonly InstallGuideStep[] = [
  {
    id: 'download',
    detailKey: 'guide.download.detail',
    blocks: [
      {
        kind: 'link',
        labelKey: 'guide.download.link',
        url: 'https://maven.apache.org/download.cgi',
      },
      { kind: 'code', value: 'apache-maven-3.9.11-bin.zip', noteKey: 'guide.download.code-note' },
    ],
  },
  {
    id: 'extract',
    detailKey: 'guide.extract.detail',
    blocks: [{ kind: 'kv', rows: [{ labelKey: 'guide.extract.dir', value: EXTRACT_DIR }] }],
  },
  {
    id: 'env',
    detailKey: 'guide.env.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.env.var-name', value: 'MAVEN_HOME' },
          { labelKey: 'guide.env.var-value', value: EXTRACT_DIR },
          { labelKey: 'guide.env.path-append', value: '%MAVEN_HOME%\\bin' },
        ],
      },
    ],
  },
  {
    id: 'verify',
    detailKey: 'guide.verify.detail',
    blocks: [
      { kind: 'code', value: 'mvn -version' },
      {
        kind: 'file',
        nameKey: 'guide.verify.output',
        content: `Apache Maven 3.9.11\nMaven home: ${EXTRACT_DIR}\nJava version: 1.8.0_391, vendor: Oracle Corporation`,
      },
    ],
  },
  {
    id: 'settings',
    detailKey: 'guide.settings.detail',
    blocks: [
      {
        kind: 'file',
        nameKey: 'guide.settings.file',
        content: `<localRepository>D:\\Apache\\maven-repo</localRepository>\n\n<mirror>\n  <id>aliyun-maven</id>\n  <mirrorOf>central</mirrorOf>\n  <url>https://maven.aliyun.com/repository/public</url>\n</mirror>`,
        noteKey: 'guide.settings.note',
      },
    ],
  },
  {
    id: 'idea',
    detailKey: 'guide.idea.detail',
    blocks: [
      {
        kind: 'kv',
        rows: [
          { labelKey: 'guide.idea.maven-home', value: EXTRACT_DIR },
          { labelKey: 'guide.idea.user-settings', value: `${EXTRACT_DIR}\\conf\\settings.xml` },
        ],
      },
      {
        kind: 'choice',
        rows: [{ labelKey: 'guide.idea.override', valueKey: 'guide.idea.override-value' }],
      },
    ],
  },
]

/** Maven 速查静态数据：生命周期 / 参数 / settings.xml / 依赖 / 作用域 / 工程 / 排错 */
export const mavenMemoGroups: readonly MavenMemoGroup[] = [
  {
    id: 'build',
    items: [
      item('mvn clean', 'build-clean'),
      item('mvn compile', 'build-compile'),
      item('mvn test', 'build-test'),
      item('mvn package', 'build-package'),
      item('mvn verify', 'build-verify'),
      item('mvn install', 'build-install'),
      item('mvn deploy', 'build-deploy'),
      item('mvn clean install', 'build-clean-install'),
      item('mvn site', 'build-site'),
    ],
  },
  {
    id: 'options',
    items: [
      item('mvn clean install -U', 'opt-update'),
      item('mvn package -DskipTests', 'opt-skip-tests'),
      item('mvn package -Dmaven.test.skip=true', 'opt-skip-test-compile'),
      item('mvn install -o', 'opt-offline'),
      item('mvn install -X', 'opt-debug'),
      item('mvn compile -pl <module> -am', 'opt-pl'),
      item('mvn test -Dtest=<ClassName>#<method>', 'opt-single-test'),
      item('mvn install -Dmaven.repo.local=<path>', 'opt-repo-local'),
      item('mvn -T 1C package', 'opt-threads'),
      item('mvn --batch-mode package', 'opt-batch'),
    ],
  },
  {
    id: 'settings',
    items: [
      item('<localRepository>D:\\Apache\\maven-repo</localRepository>', 'set-local-repository'),
      item(
        '<mirror><id>aliyun-maven</id><mirrorOf>central</mirrorOf><url>https://maven.aliyun.com/repository/public</url></mirror>',
        'set-mirror-aliyun',
      ),
      item(
        '<mirror><id>huaweicloud</id><mirrorOf>central</mirrorOf><url>https://repo.huaweicloud.com/repository/maven/</url></mirror>',
        'set-mirror-huawei',
      ),
      item('<mirrorOf>central</mirrorOf>', 'set-mirror-of-central'),
      item('<mirrorOf>*</mirrorOf>', 'set-mirror-of-all'),
      item(
        '<server><id>releases</id><username>${env.MVN_USER}</username><password>${env.MVN_PASS}</password></server>',
        'set-server',
      ),
      item(
        '<activeProfiles><activeProfile>jdk17</activeProfile></activeProfiles>',
        'set-active-profiles',
      ),
      item('mvn help:effective-settings', 'set-effective-settings'),
      item('mvn help:effective-pom', 'set-effective-pom'),
      item('mvn -s <path>/settings.xml package', 'set-custom-file'),
    ],
  },
  {
    id: 'deps',
    items: [
      item('mvn dependency:tree', 'dep-tree'),
      item('mvn dependency:tree -Dverbose', 'dep-tree-verbose'),
      item('mvn dependency:tree -Dincludes=<groupId>:*', 'dep-tree-filter'),
      item('mvn dependency:analyze', 'dep-analyze'),
      item('mvn dependency:copy-dependencies -DoutputDirectory=lib', 'dep-copy'),
      item('mvn dependency:purge-local-repository', 'dep-purge'),
      item(
        '<exclusions><exclusion><groupId>org.slf4j</groupId><artifactId>*</artifactId></exclusion></exclusions>',
        'dep-exclusions',
      ),
      item('<optional>true</optional>', 'dep-optional'),
      item('mvn versions:display-dependency-updates', 'dep-display-updates'),
      item('mvn versions:use-latest-releases', 'dep-use-latest'),
    ],
  },
  {
    id: 'scope',
    items: [
      item('<scope>compile</scope>', 'scope-compile'),
      item('<scope>provided</scope>', 'scope-provided'),
      item('<scope>runtime</scope>', 'scope-runtime'),
      item('<scope>test</scope>', 'scope-test'),
      item('<scope>system</scope>', 'scope-system'),
    ],
  },
  {
    id: 'project',
    items: [
      item('mvn archetype:generate -DgroupId=com.example -DartifactId=demo', 'proj-archetype'),
      item('mvn wrapper:wrapper -Dmaven=3.9.11', 'proj-wrapper'),
      item('./mvnw clean package', 'proj-mvnw'),
      item('<groupId>com.example</groupId>', 'proj-group-id'),
      item('<artifactId>demo-service</artifactId>', 'proj-artifact-id'),
      item('<version>1.0.0</version>', 'proj-version'),
      item('<packaging>pom</packaging>', 'proj-packaging-pom'),
      item('<dependencyManagement>', 'proj-dependency-management'),
    ],
  },
  {
    id: 'troubleshoot',
    items: [
      item('set JAVA_HOME=C:\\Program Files\\Java\\jdk-17', 'ts-java-home'),
      item('mvn clean install -U', 'ts-cached-failure'),
      item('del /s /q %USERPROFILE%\\.m2\\repository\\*.lastUpdated', 'ts-last-updated'),
      item('mvn -version', 'ts-target-release'),
      item('mvn -s <path>/settings.xml -U clean install', 'ts-force-settings'),
      item(
        'keytool -import -alias corp-ca -file corp.cer -keystore %JAVA_HOME%\\lib\\security\\cacerts',
        'ts-pkix',
      ),
    ],
  },
]
