import { DEFAULT_FIELD_ORDER, DEFAULT_PHOTO_CONFIG } from './constants'
import type { GlobalSettings, ResumeData } from './types'

/** 种子缺少 id/时间戳/模板，由 store 在创建时补齐 */
export type ResumeSeed = Omit<ResumeData, 'id' | 'createdAt' | 'updatedAt' | 'templateId'>

const initialGlobalSettings: GlobalSettings = {
  baseFontSize: 16,
  pagePadding: 32,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  sectionSpacing: 10,
  headerSize: 18,
  subheaderSize: 16,
  useIconMode: true,
  themeColor: '#000000',
  centerSubtitle: true,
  pageBreakLinesVisible: true,
}

export const sampleResumeZh: ResumeSeed = {
  title: '新建简历',
  basic: {
    name: '哈基墩',
    title: '后端开发工程师',
    employementStatus: '离职',
    email: 'hajidun@example.com',
    phone: '13800138000',
    location: '广东广州',
    birthDate: '2025-01',
    fieldOrder: DEFAULT_FIELD_ORDER,
    icons: {
      email: 'Mail',
      phone: 'Phone',
      birthDate: 'CalendarRange',
      employementStatus: 'Briefcase',
      location: 'MapPin',
    },
    photoConfig: DEFAULT_PHOTO_CONFIG,
    customFields: [
      {
        id: 'personal',
        label: '个人网站',
        value: 'https://hajidun.dev',
        icon: 'Globe',
      },
    ],
    photo: '/avatar.png',
    githubKey: '',
    githubUseName: '',
    githubContributionsVisible: false,
  },
  education: [
    {
      id: '1',
      school: '北京大学',
      major: '计算机科学与技术',
      degree: '',
      startDate: '2013-09',
      endDate: '2017-06',
      visible: true,
      gpa: '',
      description: `<ul>
        <li>主修课程：数据结构、算法设计、操作系统、计算机网络、分布式系统</li>
        <li>专业排名前 5%，连续三年获得一等奖学金</li>
        <li>担任计算机协会技术部部长，组织多次后端技术分享会</li>
        <li>参与开源项目贡献，获得 GitHub Campus Expert 认证</li>
      </ul>`,
    },
  ],
  skillContent: `<div class="skill-content">
  <ul>
    <li>服务端语言：熟悉 Java、Go，了解 Python、Kotlin 等语言</li>
    <li>框架生态：Spring Boot、Spring Cloud、MyBatis、gRPC、Dubbo</li>
    <li>数据库：MySQL 索引与事务原理、慢查询优化、分库分表</li>
    <li>缓存与消息：Redis 数据结构与缓存一致性、Kafka / RocketMQ 削峰填谷与顺序消息</li>
    <li>分布式：分布式事务、分布式锁、幂等设计、限流降级与熔断</li>
    <li>容器与部署：Docker、Kubernetes、GitLab CI、灰度发布与回滚</li>
    <li>可观测性：Prometheus、Grafana、ELK、SkyWalking 链路追踪</li>
    <li>计算机基础：数据结构与算法、操作系统、网络协议、常用设计模式</li>
    <li>技术管理：具备团队管理经验，主导过多个大型服务的架构设计与技术选型</li>
  </ul>
</div>`,
  selfEvaluationContent: '',
  experience: [
    {
      id: '1',
      company: '字节跳动',
      position: '后端开发工程师',
      date: '2021.07 - 2024.12',
      visible: true,
      details: `<ul>
      <li>负责电商交易中台订单履约链路的开发与维护，主导多个核心服务的方案设计</li>
      <li>重构下单服务，将核心接口 P99 延迟从 800ms 降至 180ms，支撑大促峰值 12 万 QPS</li>
      <li>设计 Redis + 本地缓存的多级缓存方案，缓存命中率提升至 98%，数据库压力下降 60%</li>
      <li>搭建限流与降级体系，大促期间核心链路零 P0 故障，故障平均恢复时间缩短至 3 分钟</li>
      <li>指导初级工程师，组织后端技术分享会，提升团队整体技术水平</li>
    </ul>`,
    },
  ],
  draggingProjectId: null,
  projects: [
    {
      id: 'p1',
      name: '交易中台订单服务',
      role: '后端负责人',
      date: '2022.06 - 2023.12',
      description: `<ul>
        <li>承载下单、支付、履约全链路的交易中台，日均订单量 2000 万级</li>
        <li>拆分为订单、库存、营销等微服务，通过 gRPC 通信并以消息队列保证最终一致性</li>
        <li>基于 TCC 实现跨服务分布式事务，配合幂等表解决重复提交问题</li>
        <li>引入分库分表与冷热数据归档，单表数据量控制在 500 万行以内</li>
        <li>建设全链路压测与限流预案，支撑大促流量 8 倍增长</li>
      </ul>`,
      visible: true,
    },
    {
      id: 'p2',
      name: '分布式任务调度平台',
      role: '核心开发者',
      date: '2020.03 - 2021.06',
      description: `<ul>
        <li>为公司内部提供定时任务、批处理与工作流编排的一站式解决方案</li>
        <li>采用主从架构与一致性哈希分片，单集群支持 10 万级任务调度</li>
        <li>实现任务失败重试、超时熔断与死信告警，异常任务平均处理时长下降 70%</li>
        <li>提供 Web 控制台与 OpenAPI，支持多租户权限隔离</li>
        <li>接入 Prometheus 指标，任务执行耗时与成功率可视化</li>
      </ul>`,
      visible: true,
    },
    {
      id: 'p3',
      name: '实时风控系统',
      role: '技术负责人',
      date: '2021.09 - 2022.03',
      description: `<ul>
        <li>面向交易场景的实时风控系统，包含规则引擎、名单服务与模型评分三部分</li>
        <li>基于 Flink 构建流式计算链路，事件从产生到决策平均耗时 120ms</li>
        <li>规则支持热更新与灰度生效，策略上线周期从 3 天缩短至 2 小时</li>
        <li>使用 Redis 集群承载名单与特征存储，QPS 峰值 5 万</li>
        <li>对接工单与回流标注体系，误杀率下降 35%</li>
      </ul>`,
      visible: true,
    },
  ],
  menuSections: [
    { id: 'basic', title: '基本信息', icon: 'User', enabled: true, order: 0 },
    { id: 'skills', title: '专业技能', icon: 'Zap', enabled: true, order: 1 },
    {
      id: 'experience',
      title: '工作经验',
      icon: 'Briefcase',
      enabled: true,
      order: 2,
    },

    {
      id: 'projects',
      title: '项目经历',
      icon: 'Rocket',
      enabled: true,
      order: 3,
    },
    {
      id: 'education',
      title: '教育经历',
      icon: 'GraduationCap',
      enabled: true,
      order: 4,
    },
  ],
  certificates: [],
  customData: {},
  activeSection: 'basic',
  globalSettings: initialGlobalSettings,
}

export const sampleResumeEn: ResumeSeed = {
  title: 'New Resume',
  basic: {
    name: 'Hajidun',
    title: 'Backend Engineer',
    employementStatus: 'Available',
    email: 'hajidun@example.com',
    phone: '555-123-4567',
    location: 'Guangzhou, China',
    birthDate: '',
    fieldOrder: DEFAULT_FIELD_ORDER,
    icons: {
      email: 'Mail',
      phone: 'Phone',
      birthDate: 'CalendarRange',
      employementStatus: 'Briefcase',
      location: 'MapPin',
    },
    photoConfig: DEFAULT_PHOTO_CONFIG,
    customFields: [],
    photo: '/avatar.png',
    githubKey: '',
    githubUseName: '',
    githubContributionsVisible: false,
  },
  education: [
    {
      id: '1',
      school: 'Stanford University',
      major: 'Computer Science',
      degree: '',
      startDate: '2013-09',
      endDate: '2017-06',
      visible: true,
      gpa: '',
      description: `<ul>
        <li>Core courses: Data Structures, Algorithms, Operating Systems, Computer Networks, Distributed Systems</li>
        <li>Top 5% of class, received Dean's List honors for three consecutive years</li>
        <li>Served as Technical Director of the Computer Science Association, organized backend tech workshops</li>
        <li>Contributed to open-source projects, earned GitHub Campus Expert certification</li>
      </ul>`,
    },
  ],
  skillContent: `<div class="skill-content">
  <ul>
    <li>Languages: Java, Go; familiar with Python and Kotlin</li>
    <li>Frameworks: Spring Boot, Spring Cloud, MyBatis, gRPC, Dubbo</li>
    <li>Databases: MySQL indexing and transaction internals, slow query tuning, sharding</li>
    <li>Cache &amp; Messaging: Redis data structures and cache consistency, Kafka / RocketMQ</li>
    <li>Distributed Systems: distributed transactions, distributed locks, idempotency, rate limiting</li>
    <li>Cloud Native: Docker, Kubernetes, GitLab CI, canary release and rollback</li>
    <li>Observability: Prometheus, Grafana, ELK, SkyWalking distributed tracing</li>
    <li>Fundamentals: data structures, operating systems, network protocols, design patterns</li>
    <li>Technical Leadership: led architecture design and technology selection for large services</li>
  </ul>
</div>`,
  selfEvaluationContent: '',
  experience: [
    {
      id: '1',
      company: 'ByteDance',
      position: 'Backend Engineer',
      date: '2021.07 - 2024.12',
      visible: true,
      details: `<ul>
      <li>Owned the order fulfilment chain of the e-commerce trading platform, designing solutions for core services</li>
      <li>Refactored the order creation service, cutting P99 latency from 800ms to 180ms at 120k peak QPS</li>
      <li>Designed a multi-level cache (Redis + in-process), raising hit rate to 98% and cutting DB load by 60%</li>
      <li>Built rate limiting and degradation plans: zero P0 incidents during the flagship promotion</li>
      <li>Mentored junior engineers, organized technical sharing sessions to improve overall team capabilities</li>
    </ul>`,
    },
  ],
  draggingProjectId: null,
  projects: [
    {
      id: 'p1',
      name: 'Trading Platform Order Service',
      role: 'Backend Lead',
      date: '2022.06 - 2023.12',
      description: `<ul>
        <li>Trading platform covering order creation, payment and fulfilment, 20M orders per day</li>
        <li>Split into order, inventory and promotion services, communicating over gRPC with eventual consistency</li>
        <li>Implemented cross-service distributed transactions with TCC and an idempotency table</li>
        <li>Introduced sharding and cold-data archiving, keeping each table under 5M rows</li>
        <li>Established full-chain load testing and throttling plans, sustaining 8x promotion traffic</li>
      </ul>`,
      visible: true,
    },
    {
      id: 'p2',
      name: 'Distributed Task Scheduler',
      role: 'Core Developer',
      date: '2020.03 - 2021.06',
      description: `<ul>
        <li>One-stop platform for cron jobs, batch processing and workflow orchestration</li>
        <li>Master-worker architecture with consistent hashing, scheduling 100k tasks per cluster</li>
        <li>Added retry, timeout circuit breaking and dead-letter alerts, cutting triage time by 70%</li>
        <li>Shipped a web console and OpenAPI with multi-tenant isolation</li>
        <li>Exposed Prometheus metrics for task duration and success rate</li>
      </ul>`,
      visible: true,
    },
    {
      id: 'p3',
      name: 'Real-time Risk Engine',
      role: 'Technical Lead',
      date: '2021.09 - 2022.03',
      description: `<ul>
        <li>Real-time risk system for payments: rule engine, blocklist service and model scoring</li>
        <li>Built on Flink, deciding in 120ms on average from event to verdict</li>
        <li>Hot-reloadable rules with canary rollout, shortening strategy launch from 3 days to 2 hours</li>
        <li>Redis cluster serving blocklists and features at 50k QPS peak</li>
        <li>Closed the loop with ticketing and labelled feedback, reducing false positives by 35%</li>
      </ul>`,
      visible: true,
    },
  ],
  menuSections: [
    {
      id: 'basic',
      title: 'Profile',
      icon: 'User',
      enabled: true,
      order: 0,
    },
    {
      id: 'skills',
      title: 'Skills',
      icon: 'Zap',
      enabled: true,
      order: 1,
    },
    {
      id: 'experience',
      title: 'Experience',
      icon: 'Briefcase',
      enabled: true,
      order: 2,
    },
    {
      id: 'projects',
      title: 'Projects',
      icon: 'Rocket',
      enabled: true,
      order: 3,
    },
    {
      id: 'education',
      title: 'Education',
      icon: 'GraduationCap',
      enabled: true,
      order: 4,
    },
  ],
  certificates: [],
  customData: {},
  activeSection: 'basic',
  globalSettings: initialGlobalSettings,
}

export const blankResumeZh: ResumeSeed = {
  ...sampleResumeZh,
  title: '新建简历',
  basic: {
    ...sampleResumeZh.basic,
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    birthDate: '',
    employementStatus: '',
    photo: '',
    customFields: [],
  },
  education: [],
  skillContent: '',
  selfEvaluationContent: '',
  experience: [],
  projects: [],
  certificates: [],
  menuSections: [sampleResumeZh.menuSections[0]],
}

export const blankResumeEn: ResumeSeed = {
  ...sampleResumeEn,
  title: 'New Resume',
  basic: {
    ...sampleResumeEn.basic,
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    birthDate: '',
    employementStatus: '',
    photo: '',
    customFields: [],
  },
  education: [],
  skillContent: '',
  selfEvaluationContent: '',
  experience: [],
  projects: [],
  certificates: [],
  menuSections: [sampleResumeEn.menuSections[0]],
}
