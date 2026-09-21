/**
 * 签文库 —— 40 条签诗，按运势分值分 8 档（98/84/70/56/42/28/14/0），每档 5 条。
 *
 * - signText：公版古诗（唐宋及以前诗人作品，已进入公有领域），英文为本项目原创译写；
 * - signSource：诗作出处（中英双语）；
 * - unsignText：本项目原创白话详解（中英双语）；
 * - 抽签算法见 fortune-draw.service.ts。
 */
export type LocalText = {
  zh: string
  en: string
}

export type FortuneEntry = {
  summary: LocalText
  luckyStar: string
  signText: LocalText
  signSource: LocalText
  unsignText: LocalText
  luckValue: number
}

export const FORTUNE_POOL: Record<string, FortuneEntry[]> = {
  '98': [
    {
      summary: { zh: '大吉', en: 'Great Fortune' },
      luckyStar: '★★★★★★★',
      signText: {
        zh: '长风破浪会有时，直挂云帆济沧海',
        en: 'A time will come to ride the wind and break the waves, sailing straight across the sea.',
      },
      signSource: { zh: '李白《行路难·其一》', en: 'Li Bai, "The Hard Road (I)"' },
      unsignText: {
        zh: '眼下的困顿只是暂时，运势正走到厚积薄发的拐点。放手去做搁置已久的事，贵人与时机会同时出现，大胆前进必有回响。',
        en: 'Your stagnation is temporary; momentum has reached its tipping point. Restart what you shelved — allies and timing arrive together. Move boldly.',
      },
      luckValue: 98,
    },
    {
      summary: { zh: '大吉·事业', en: 'Great Fortune · Career' },
      luckyStar: '★★★★★★★',
      signText: {
        zh: '会当凌绝顶，一览众山小',
        en: 'I shall climb to the very summit, and all mountains will look small.',
      },
      signSource: { zh: '杜甫《望岳》', en: 'Du Fu, "Gazing at the Peak"' },
      unsignText: {
        zh: '志在顶峰的人，今天的每一步都在向上。事业与学业迎来登高远望的时刻，曾经让你仰望的难题，很快会变成脚下的风景。',
        en: 'Every step today points upward. Career and study reach a vantage moment — what once loomed over you will soon lie beneath your feet.',
      },
      luckValue: 98,
    },
    {
      summary: { zh: '大吉·喜讯', en: 'Great Fortune · Tidings' },
      luckyStar: '★★★★★★★',
      signText: {
        zh: '春风得意马蹄疾，一日看尽长安花',
        en: "On a proud spring breeze my horse runs swift; in one day I see all the flowers of Chang'an.",
      },
      signSource: { zh: '孟郊《登科后》', en: 'Meng Jiao, "After Passing the Exam"' },
      unsignText: {
        zh: '好消息已在路上，可能来自成绩、签约或期待已久的认可。保持自信接住它，也别忘了和一路同行的人分享喜悦。',
        en: 'Good news is on its way — a result, a deal, or long-awaited recognition. Receive it with confidence, and share the joy with those who walked with you.',
      },
      luckValue: 98,
    },
    {
      summary: { zh: '大吉·灵感', en: 'Great Fortune · Muse' },
      luckyStar: '★★★★★★★',
      signText: {
        zh: '晴空一鹤排云上，便引诗情到碧霄',
        en: 'A crane pierces the clouds into the clear sky, lifting my poetic spirit to the blue above.',
      },
      signSource: { zh: '刘禹锡《秋词·其一》', en: 'Liu Yuxi, "Autumn Song (I)"' },
      unsignText: {
        zh: '心境与运势一起放晴。创意与灵感格外活跃，适合写作、创作、提案与表达，你的奇思妙想今天很容易被看见。',
        en: 'Mood and fortune clear together. Creativity runs high — ideal for writing, making, and pitching. Your original ideas get noticed today.',
      },
      luckValue: 98,
    },
    {
      summary: { zh: '大吉·财运', en: 'Great Fortune · Wealth' },
      luckyStar: '★★★★★★★',
      signText: {
        zh: '天生我材必有用，千金散尽还复来',
        en: 'Heaven gave me talent and it will find its use; a thousand gold spent returns again.',
      },
      signSource: { zh: '李白《将进酒》', en: 'Li Bai, "Bring in the Wine"' },
      unsignText: {
        zh: '财运与自我价值感双双走强。该投资自己就大方投入，你的能力正在被对的人看见，失去的资源会以另一种方式回来。',
        en: 'Wealth luck and self-worth both surge. Invest in yourself generously — the right people are noticing your ability, and what was lost returns in another form.',
      },
      luckValue: 98,
    },
  ],
  '84': [
    {
      summary: { zh: '上吉', en: 'Excellent Fortune' },
      luckyStar: '★★★★★★☆',
      signText: {
        zh: '沉舟侧畔千帆过，病树前头万木春',
        en: 'Beside the sunken ship a thousand sails pass; ahead of the ailing tree, ten thousand trees greet spring.',
      },
      signSource: { zh: '刘禹锡《酬乐天扬州初逢席上见赠》', en: 'Liu Yuxi, "Reply to Bai Juyi"' },
      unsignText: {
        zh: '旧的一页已经翻过去，新的竞争与生机正在展开。别再为过去的失误懊恼，你的位置在新长出的那片林子里。',
        en: 'The old page has turned; new races and new growth are underway. Stop regretting past mistakes — your place is in the freshly growing woods.',
      },
      luckValue: 84,
    },
    {
      summary: { zh: '上吉·转机', en: 'Excellent Fortune · Turn' },
      luckyStar: '★★★★★★☆',
      signText: {
        zh: '山重水复疑无路，柳暗花明又一村',
        en: 'Beyond folding mountains and winding streams, willows darken, flowers brighten — another village appears.',
      },
      signSource: { zh: '陆游《游山西村》', en: 'Lu You, "Visiting a Mountain Village"' },
      unsignText: {
        zh: '卡住的局面即将松动，出路藏在再试一次的转角。今天适合复盘卡壳的事，换个路径走，答案会自己现身。',
        en: 'The deadlock is about to loosen; the exit hides around one more turn. Revisit what is stuck and take a different path — the answer will show itself.',
      },
      luckValue: 84,
    },
    {
      summary: { zh: '上吉·进取', en: 'Excellent Fortune · Drive' },
      luckyStar: '★★★★★★☆',
      signText: {
        zh: '欲穷千里目，更上一层楼',
        en: 'To see a thousand miles further, climb one more storey.',
      },
      signSource: { zh: '王之涣《登鹳雀楼》', en: 'Wang Zhihuan, "On the Stork Tower"' },
      unsignText: {
        zh: '运势稳步上行，但奖励只给愿意多走一步的人。把手头的目标再提高一档，多做的那一点，就是今天好运的来源。',
        en: "Fortune rises steadily, but it rewards those who go one step further. Raise today's goal by one notch — that extra effort is where the luck lives.",
      },
      luckValue: 84,
    },
    {
      summary: { zh: '上吉·新芽', en: 'Excellent Fortune · Sprout' },
      luckyStar: '★★★★★★☆',
      signText: {
        zh: '海日生残夜，江春入旧年',
        en: 'The sea-sun rises from the fading night; river-spring enters the old year.',
      },
      signSource: { zh: '王湾《次北固山下》', en: 'Wang Wan, "Mooring at Beigu Mountain"' },
      unsignText: {
        zh: '新旧交替的节点到了：旧计划收尾、新机会萌芽。别留恋已经完成使命的东西，把精力拨给刚冒头的新芽，长势会超预期。',
        en: 'A turning point between old and new: old plans wrap up while fresh chances sprout. Shift energy to the new buds — they will outgrow expectations.',
      },
      luckValue: 84,
    },
    {
      summary: { zh: '上吉·顺流', en: 'Excellent Fortune · Flow' },
      luckyStar: '★★★★★★☆',
      signText: {
        zh: '两岸猿声啼不住，轻舟已过万重山',
        en: 'While gibbons cry along both banks, my light boat has already passed ten thousand mountains.',
      },
      signSource: { zh: '李白《早发白帝城》', en: 'Li Bai, "Leaving Baidi at Dawn"' },
      unsignText: {
        zh: '拖了许久的阻力忽然变轻，推进速度会快得超出预期。别被沿途的杂音干扰，专注航线，万重山很快甩在身后。',
        en: 'Long-standing drag suddenly lightens; progress will outpace expectations. Ignore the noise along the banks — the mountains will soon be behind you.',
      },
      luckValue: 84,
    },
  ],
  '70': [
    {
      summary: { zh: '中吉', en: 'Good Fortune' },
      luckyStar: '★★★★★☆☆',
      signText: {
        zh: '千磨万击还坚劲，任尔东西南北风',
        en: 'Through a thousand grindings it stands firm, letting winds blow from every side.',
      },
      signSource: { zh: '郑燮《竹石》', en: 'Zheng Xie, "Bamboo in the Rock"' },
      unsignText: {
        zh: '运势的底色是「稳」。外界的质疑和干扰伤不到根本，按计划推进就好，你的韧性正是别人拿不走的优势。',
        en: "The day's keynote is steadiness. Doubts and distractions cannot touch your foundation — follow your plan; your resilience is the advantage no one can take.",
      },
      luckValue: 70,
    },
    {
      summary: { zh: '中吉·格局', en: 'Good Fortune · Vision' },
      luckyStar: '★★★★★☆☆',
      signText: {
        zh: '不畏浮云遮望眼，自缘身在最高层',
        en: 'No fear of clouds blocking the view — I stand upon the highest storey.',
      },
      signSource: { zh: '王安石《登飞来峰》', en: 'Wang Anshi, "Climbing Feilai Peak"' },
      unsignText: {
        zh: '眼前的迷雾遮不住真正的方向。做判断时拉高一个层级看问题，琐碎的纷扰会自动变小，你的大局观今天特别可靠。',
        en: 'Fog cannot hide the true direction. Judge matters from one level higher — trivia shrinks on its own. Your big-picture sense is especially reliable today.',
      },
      luckValue: 70,
    },
    {
      summary: { zh: '中吉·输入', en: 'Good Fortune · Input' },
      luckyStar: '★★★★★☆☆',
      signText: {
        zh: '问渠那得清如许，为有源头活水来',
        en: 'How does the canal stay so clear? Because fresh water flows in from the source.',
      },
      signSource: { zh: '朱熹《观书有感·其一》', en: 'Zhu Xi, "Reflections While Reading (I)"' },
      unsignText: {
        zh: '状态回升的关键在于输入。读几页书、请教一个人、学一个小技能，任何新鲜的「活水」都会让整池水变清。',
        en: 'Renewal comes from input. Read a few pages, ask one person, learn one small skill — any fresh inflow clears the whole pond.',
      },
      luckValue: 70,
    },
    {
      summary: { zh: '中吉·人缘', en: 'Good Fortune · People' },
      luckyStar: '★★★★★☆☆',
      signText: {
        zh: '莫愁前路无知己，天下谁人不识君',
        en: 'Fear not that the road ahead lacks kindred souls — who under heaven does not know you?',
      },
      signSource: { zh: '高适《别董大·其一》', en: 'Gao Shi, "Farewell to Dong Da (I)"' },
      unsignText: {
        zh: '人缘运走强。主动开口的求助、自荐或邀约，得到的回应会比想象中热烈，你的口碑已经在前面替你开路。',
        en: 'People-luck rises. Ask, recommend yourself, or send the invitation — responses will be warmer than expected. Your reputation walks ahead of you.',
      },
      luckValue: 70,
    },
    {
      summary: { zh: '中吉·扎根', en: 'Good Fortune · Rooting' },
      luckyStar: '★★★★★☆☆',
      signText: {
        zh: '时人不识凌云木，直待凌云始道高',
        en: 'People never saw the cloud-touching tree — until the day it touched the clouds.',
      },
      signSource: { zh: '杜荀鹤《小松》', en: 'Du Xunhe, "The Little Pine"' },
      unsignText: {
        zh: '正在培育的事还没被看懂，不代表没有价值。继续默默扎根，不必急于证明，破土凌云的那天，质疑会自己闭嘴。',
        en: 'What you are growing is not yet understood — that does not make it worthless. Keep rooting quietly; the day it pierces the clouds, the doubters fall silent.',
      },
      luckValue: 70,
    },
  ],
  '56': [
    {
      summary: { zh: '小吉', en: 'Modest Fortune' },
      luckyStar: '★★★★☆☆☆',
      signText: {
        zh: '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生',
        en: 'Bamboo staff and straw sandals, lighter than a horse — who fears the rain? One straw cape lasts a lifetime of mist.',
      },
      signSource: { zh: '苏轼《定风波》', en: 'Su Shi, "Calming the Storm"' },
      unsignText: {
        zh: '小吉的日子，赢在心法。把期待调低半格，步伐反而轻快；今日不求大胜，但求走得从容，小确幸会自己跟上来。',
        en: 'On a modest-luck day, mindset wins. Lower expectations by half a notch and your step lightens. Seek no grand victory — small joys will follow on their own.',
      },
      luckValue: 56,
    },
    {
      summary: { zh: '小吉·慢活', en: 'Modest Fortune · Slow' },
      luckyStar: '★★★★☆☆☆',
      signText: {
        zh: '采菊东篱下，悠然见南山',
        en: 'Picking chrysanthemums by the eastern hedge, I leisurely glimpse the southern mountain.',
      },
      signSource: { zh: '陶渊明《饮酒·其五》', en: 'Tao Yuanming, "Drinking Wine (V)"' },
      unsignText: {
        zh: '好运藏在慢节奏里。今天适合把节奏放慢，好好吃饭、散步、整理房间，心静下来之后，答案和灵感会自然浮现。',
        en: 'Luck hides in a slower tempo. Eat well, take a walk, tidy your space — once the mind settles, answers and inspiration surface by themselves.',
      },
      luckValue: 56,
    },
    {
      summary: { zh: '小吉·转弯', en: 'Modest Fortune · Turn' },
      luckyStar: '★★★★☆☆☆',
      signText: {
        zh: '行到水穷处，坐看云起时',
        en: 'Walk to where the water ends, then sit and watch the clouds rise.',
      },
      signSource: { zh: '王维《终南别业》', en: 'Wang Wei, "My Villa at Zhongnan"' },
      unsignText: {
        zh: '一条路走到头不是绝境，而是换姿态的邀请。今天遇到死胡同别硬撞，停下来换个角度看，新的局面正在头顶聚积。',
        en: "Reaching the end of a road is not a dead end but an invitation to change posture. Don't batter the wall — sit, shift your view, and watch a new sky gather.",
      },
      luckValue: 56,
    },
    {
      summary: { zh: '小吉·故友', en: 'Modest Fortune · Friends' },
      luckyStar: '★★★★☆☆☆',
      signText: {
        zh: '海内存知己，天涯若比邻',
        en: 'While a true friend lives within the seas, the ends of the earth are next door.',
      },
      signSource: { zh: '王勃《送杜少府之任蜀州》', en: 'Wang Bo, "Farewell to Vice-Prefect Du"' },
      unsignText: {
        zh: '远方或久未联系的人会带来暖意。适合主动发条消息、约个电话，关系的回温会顺带捎来一个实用的信息或机会。',
        en: 'Warmth arrives from someone far away or long uncontacted. Send that message or schedule that call — the reconnection carries a useful tip or chance.',
      },
      luckValue: 56,
    },
    {
      summary: { zh: '小吉·回春', en: 'Modest Fortune · Revival' },
      luckyStar: '★★★★☆☆☆',
      signText: {
        zh: '野火烧不尽，春风吹又生',
        en: 'Wildfire cannot burn it out; it grows again with the spring wind.',
      },
      signSource: { zh: '白居易《赋得古原草送别》', en: 'Bai Juyi, "Grass on the Ancient Plain"' },
      unsignText: {
        zh: '之前受挫的事在悄悄回血。给它浇一点水——一点时间、一点关注，恢复速度会比预期快，别急着宣布放弃。',
        en: "What was scorched is quietly regrowing. Water it with a little time and attention; recovery will beat expectations. Don't declare it dead yet.",
      },
      luckValue: 56,
    },
  ],
  '42': [
    {
      summary: { zh: '末吉', en: 'Slight Fortune' },
      luckyStar: '★★★☆☆☆☆',
      signText: {
        zh: '人有悲欢离合，月有阴晴圆缺',
        en: 'People part and meet, grieve and rejoice; the moon clouds and clears, wanes and waxes.',
      },
      signSource: { zh: '苏轼《水调歌头》', en: 'Su Shi, "Prelude to Water Melody"' },
      unsignText: {
        zh: '今天的起伏是常态而非意外。顺时别飘，逆时别慌，把情绪交给时间，把事情交给步骤，平稳就是今天最大的收获。',
        en: "Today's ups and downs are the norm, not the exception. Don't float in success or panic in dips — give feelings to time and tasks to process. Steady is the win.",
      },
      luckValue: 42,
    },
    {
      summary: { zh: '末吉·视角', en: 'Slight Fortune · Angle' },
      luckyStar: '★★★☆☆☆☆',
      signText: {
        zh: '不识庐山真面目，只缘身在此山中',
        en: "I cannot see Mount Lu's true face, for I am standing in the mountain.",
      },
      signSource: { zh: '苏轼《题西林壁》', en: 'Su Shi, "Written at West Forest Temple"' },
      unsignText: {
        zh: '当局者迷，今天特别适合请局外人帮你看一眼。换个人、换个距离、换个问题问法，困住你的谜题可能只是角度问题。',
        en: 'The insider is blind — today, let an outsider look for you. Another person, another distance, another way of asking: your puzzle may just be a matter of angle.',
      },
      luckValue: 42,
    },
    {
      summary: { zh: '末吉·绕行', en: 'Slight Fortune · Detour' },
      luckyStar: '★★★☆☆☆☆',
      signText: {
        zh: '欲渡黄河冰塞川，将登太行雪满山',
        en: 'I would cross the Yellow River — ice chokes the stream; climb Mount Taihang — snow fills the peaks.',
      },
      signSource: { zh: '李白《行路难·其一》', en: 'Li Bai, "The Hard Road (I)"' },
      unsignText: {
        zh: '硬闯的时机未到，路线需要绕行。今天别和最大的阻力正面消耗，先处理外围的小事蓄力，冰封的河道会随时间松动。',
        en: "It is not yet time to force the crossing — reroute. Don't burn energy against the biggest resistance today; clear the small perimeter tasks and let time thaw the ice.",
      },
      luckValue: 42,
    },
    {
      summary: { zh: '末吉·躬行', en: 'Slight Fortune · Doing' },
      luckyStar: '★★★☆☆☆☆',
      signText: {
        zh: '纸上得来终觉浅，绝知此事要躬行',
        en: 'What comes from paper always feels shallow; to truly know it, you must do it yourself.',
      },
      signSource: { zh: '陆游《冬夜读书示子聿》', en: 'Lu You, "Reading on a Winter Night"' },
      unsignText: {
        zh: '收藏夹里的方法论救不了今天的问题，好运在「动手」这一侧。挑一件最小的事立刻实操，做中学到的会远超再读十篇攻略。',
        en: "Saved tutorials won't solve today's problem — luck sits on the doing side. Pick the smallest task and start now; one round of practice beats ten more guides.",
      },
      luckValue: 42,
    },
    {
      summary: { zh: '末吉·专注', en: 'Slight Fortune · Focus' },
      luckyStar: '★★★☆☆☆☆',
      signText: {
        zh: '少年易老学难成，一寸光阴不可轻',
        en: 'Youth ages quickly and learning completes slowly — do not waste an inch of time.',
      },
      signSource: { zh: '朱熹《劝学诗》', en: 'Zhu Xi, "Exhortation to Study"' },
      unsignText: {
        zh: '今天的幸运色是「专注」。被切碎的时间最可惜，给自己留一两段不被打扰的整块时间，产出的质量会让未来的你感谢今天。',
        en: "Today's lucky color is focus. Fragmented hours are the greatest waste — reserve one or two uninterrupted blocks, and future-you will thank today.",
      },
      luckValue: 42,
    },
  ],
  '28': [
    {
      summary: { zh: '小凶', en: 'Minor Misfortune' },
      luckyStar: '★★☆☆☆☆☆',
      signText: {
        zh: '抽刀断水水更流，举杯消愁愁更愁',
        en: 'Draw the sword to cut the water — it flows on; raise the cup to drown sorrow — sorrow deepens.',
      },
      signSource: {
        zh: '李白《宣州谢朓楼饯别校书叔云》',
        en: 'Li Bai, "Farewell at Xie Tiao\'s Tower"',
      },
      unsignText: {
        zh: '越用力对抗，反弹越明显。今天的解法是「不解决」：放一放、出门走走、先睡一觉，等你松手，水会自己找到去处。',
        en: "The harder you fight it, the stronger it pushes back. Today's fix is to not-fix: set it down, walk outside, sleep first. Once you let go, the water finds its own way.",
      },
      luckValue: 28,
    },
    {
      summary: { zh: '小凶·时机', en: 'Minor Misfortune · Timing' },
      luckyStar: '★★☆☆☆☆☆',
      signText: {
        zh: '夕阳无限好，只是近黄昏',
        en: 'The setting sun is infinitely fine — only the dusk is near.',
      },
      signSource: { zh: '李商隐《乐游原》', en: 'Li Shangyin, "Leyou Plateau"' },
      unsignText: {
        zh: '美好的窗口正在收窄，想做的事别排在「以后」。今天优先级给时效性最强的那件事，错过时段比做错更可惜。',
        en: 'A beautiful window is closing — stop scheduling wishes for "later". Give priority to the most time-sensitive thing; missing the timing hurts more than a mistake.',
      },
      luckValue: 28,
    },
    {
      summary: { zh: '小凶·守势', en: 'Minor Misfortune · Guard' },
      luckyStar: '★★☆☆☆☆☆',
      signText: {
        zh: '时来天地皆同力，运去英雄不自由',
        en: 'When fortune comes, heaven and earth push together; when it leaves, even heroes lose their freedom.',
      },
      signSource: { zh: '罗隐《筹笔驿》', en: 'Luo Yin, "The Strategy Post"' },
      unsignText: {
        zh: '时运不在你这边，别把不顺全归因于自己。今天宜守不宜攻：少做不可逆的决定，多留证据和余地，等风回来再加速。',
        en: "The tide isn't with you — don't blame yourself for it. Defend, don't attack: avoid irreversible decisions, keep receipts and margins, and speed up when the wind returns.",
      },
      luckValue: 28,
    },
    {
      summary: { zh: '小凶·取舍', en: 'Minor Misfortune · Choice' },
      luckyStar: '★★☆☆☆☆☆',
      signText: {
        zh: '无边落木萧萧下，不尽长江滚滚来',
        en: 'Boundless falling leaves rustle down; the endless Yangtze rolls on and on.',
      },
      signSource: { zh: '杜甫《登高》', en: 'Du Fu, "Climbing High"' },
      unsignText: {
        zh: '该落的叶子拦不住，该来的水流挡不住。今天练习区分「能改变的」和「只能接受的」，把力气省给前者，心会轻很多。',
        en: 'Falling leaves can\'t be stopped, and neither can the river. Practice sorting "changeable" from "accept-only" today; saving strength for the former lightens the heart.',
      },
      luckValue: 28,
    },
    {
      summary: { zh: '小凶·心结', en: 'Minor Misfortune · Knot' },
      luckyStar: '★★☆☆☆☆☆',
      signText: {
        zh: '剪不断，理还乱，是离愁',
        en: "Cut it and it won't sever; sort it and it tangles again — the sorrow of parting.",
      },
      signSource: { zh: '李煜《相见欢》', en: 'Li Yu, "Joy of Meeting"' },
      unsignText: {
        zh: '一团乱麻多半来自情绪而非事件本身。今天先处理心情再处理事情：写下来、说出来、吃点好的，心结松了，结就好解了。',
        en: 'The tangle is mostly emotion, not events. Tend to the mood before the matter — write it out, talk it out, eat something good. Loosen the heart and the knot follows.',
      },
      luckValue: 28,
    },
  ],
  '14': [
    {
      summary: { zh: '凶', en: 'Misfortune' },
      luckyStar: '★☆☆☆☆☆☆',
      signText: {
        zh: '行路难！行路难！多歧路，今安在？',
        en: 'Hard is the road! Hard is the road! So many forks — which one is mine?',
      },
      signSource: { zh: '李白《行路难·其一》', en: 'Li Bai, "The Hard Road (I)"' },
      unsignText: {
        zh: '选择多到让人原地打转，恰是容易选错的日子。今天不做大决定，只做小试验：每条路走十步就回来汇报，明后天再定方向。',
        en: 'Too many forks make for easy wrong turns. Make no big decisions today — only small experiments: walk ten steps down each path, report back, and decide in a day or two.',
      },
      luckValue: 14,
    },
    {
      summary: { zh: '凶·愁绪', en: 'Misfortune · Gloom' },
      luckyStar: '★☆☆☆☆☆☆',
      signText: {
        zh: '问君能有几多愁？恰似一江春水向东流',
        en: 'How much sorrow do you have? Like a river of spring water flowing east.',
      },
      signSource: { zh: '李煜《虞美人》', en: 'Li Yu, "Yu Meiren"' },
      unsignText: {
        zh: '愁绪涨潮的日子，硬撑效率只会更低。允许自己低效半天，把最耗能的事挪后，潮水退去时你会发现愁的体积比想象小。',
        en: 'On a day when sorrow floods in, forcing productivity only lowers it. Allow a low-output half-day and postpone the draining tasks — when the tide ebbs, the sorrow proves smaller than it looked.',
      },
      luckValue: 14,
    },
    {
      summary: { zh: '凶·孤独', en: 'Misfortune · Lonely' },
      luckyStar: '★☆☆☆☆☆☆',
      signText: {
        zh: '夕阳西下，断肠人在天涯',
        en: "The sun sets in the west; the heartbroken one at the sky's far edge.",
      },
      signSource: { zh: '马致远《天净沙·秋思》', en: 'Ma Zhiyuan, "Autumn Thoughts"' },
      unsignText: {
        zh: '孤独感会被夜色放大，别一个人硬扛。主动汇入人群：一顿热闹的饭、一场连麦、一段群聊，人间的烟火气是今天最好的药。',
        en: "Loneliness amplifies after dark — don't carry it solo. Merge into company: a lively meal, a call, a group chat. Human warmth is today's best medicine.",
      },
      luckValue: 14,
    },
    {
      summary: { zh: '凶·低电', en: 'Misfortune · Drain' },
      luckyStar: '★☆☆☆☆☆☆',
      signText: {
        zh: '艰难苦恨繁霜鬓，潦倒新停浊酒杯',
        en: 'Hardship and regret thicken the frost in my hair; down and out, I have even quit the cloudy wine.',
      },
      signSource: { zh: '杜甫《登高》', en: 'Du Fu, "Climbing High"' },
      unsignText: {
        zh: '能量槽见底，今天的任务清单越短越好。砍到只剩一件必须做的事，其余全部授权、延期或放弃，保住电量就是保住明天的翻盘机会。',
        en: "The battery is red — keep today's list as short as possible. Cut it to one must-do; delegate, delay, or drop the rest. Saving charge today keeps tomorrow's comeback alive.",
      },
      luckValue: 14,
    },
    {
      summary: { zh: '凶·空心', en: 'Misfortune · Hollow' },
      luckyStar: '★☆☆☆☆☆☆',
      signText: {
        zh: '寻寻觅觅，冷冷清清，凄凄惨惨戚戚',
        en: 'Searching and seeking, cold and desolate, dreary and miserable.',
      },
      signSource: { zh: '李清照《声声慢》', en: 'Li Qingzhao, "Slow Slow Song"' },
      unsignText: {
        zh: '心里空落落的时候，别用瞎忙填。允许情绪存在，同时给身体最基本的照顾：热汤、热水澡、早睡，情绪退潮往往从身体回暖开始。',
        en: "When the heart feels hollow, don't stuff it with busywork. Let the feeling exist while giving your body basic care — hot soup, a warm shower, early sleep. Emotions ebb when the body warms.",
      },
      luckValue: 14,
    },
  ],
  '0': [
    {
      summary: { zh: '大凶', en: 'Great Misfortune' },
      luckyStar: '☆☆☆☆☆☆☆',
      signText: {
        zh: '床头屋漏无干处，雨脚如麻未断绝',
        en: 'Rain leaks onto the bed, no dry spot left; the raindrops fall like endless hemp threads.',
      },
      signSource: {
        zh: '杜甫《茅屋为秋风所破歌》',
        en: 'Du Fu, "My Cottage Wrecked by Autumn Wind"',
      },
      unsignText: {
        zh: '屋漏偏逢连夜雨，今天先堵漏再谈赶路：找出最大的那个麻烦，集中火力先解决它，其余的小雨滴等屋顶修好自然听不见。',
        en: "The roof leaks and the night rain won't stop — plug holes before marching on. Find the single biggest trouble and focus all fire on it; once the roof is fixed, the smaller drips fade away.",
      },
      luckValue: 0,
    },
    {
      summary: { zh: '大凶·落幕', en: 'Great Misfortune · Ending' },
      luckyStar: '☆☆☆☆☆☆☆',
      signText: {
        zh: '流水落花春去也，天上人间',
        en: 'Flowing water, fallen blossoms — spring is gone, as far as heaven from earth.',
      },
      signSource: { zh: '李煜《浪淘沙令》', en: 'Li Yu, "Ripples Sifting Sand"' },
      unsignText: {
        zh: '一个阶段彻底落幕，承认「结束了」反而是解脱。今天适合正式告别：删掉、归还、道谢、拉黑，腾出空地，新的季节才有地方落脚。',
        en: 'A chapter has fully closed — admitting "it\'s over" is itself a relief. Say the formal goodbyes today: delete, return, thank, block. Clear the ground so the new season has somewhere to land.',
      },
      luckValue: 0,
    },
    {
      summary: { zh: '大凶·物是', en: 'Great Misfortune · Change' },
      luckyStar: '☆☆☆☆☆☆☆',
      signText: {
        zh: '雕栏玉砌应犹在，只是朱颜改',
        en: 'The carved rails and jade steps should still be there — only the faces have changed.',
      },
      signSource: { zh: '李煜《虞美人》', en: 'Li Yu, "Yu Meiren"' },
      unsignText: {
        zh: '环境没变，人心已变，执着于原样复刻只会更失落。今天练习「物是人非」的接受力：调整期待版本号，从 v1.0 升到 v2.0，重新适配现实。',
        en: 'The setting is unchanged but the people have changed; clinging to the old picture deepens the loss. Practice acceptance today: bump expectations from v1.0 to v2.0 and re-fit reality.',
      },
      luckValue: 0,
    },
    {
      summary: { zh: '大凶·风暴', en: 'Great Misfortune · Storm' },
      luckyStar: '☆☆☆☆☆☆☆',
      signText: {
        zh: '风急天高猿啸哀，渚清沙白鸟飞回',
        en: 'Fierce wind, high sky, gibbons wailing; clear islets, white sand, birds circling back.',
      },
      signSource: { zh: '杜甫《登高》', en: 'Du Fu, "Climbing High"' },
      unsignText: {
        zh: '外部环境风大浪急，不是出海的日子。取消非必要的奔波，守住基本盘：健康、钱包、关键关系，风暴过境前，站稳就是胜利。',
        en: 'The weather outside is foul — no day to set sail. Cancel nonessential trips and guard the basics: health, wallet, key relationships. Standing firm through the storm is itself a victory.',
      },
      luckValue: 0,
    },
    {
      summary: { zh: '大凶·谷底', en: 'Great Misfortune · Valley' },
      luckyStar: '☆☆☆☆☆☆☆',
      signText: {
        zh: '断送一生憔悴，只销几个黄昏',
        en: "A whole life's haggardness can be delivered by just a few dusks.",
      },
      signSource: { zh: '赵令畤《清平乐》', en: 'Zhao Lingzhi, "Qing Ping Yue"' },
      unsignText: {
        zh: '低谷的黄昏总觉得熬不完，但「觉得」不等于「事实」。今天只做维持生命体征的小事，把宏大的担忧推给明天，低谷签的意义是提醒：谷底之后只有上坡。',
        en: 'Low-point dusks feel endless, but "feels" is not "is". Do only life-support tasks today and push grand worries to tomorrow. A rock-bottom lot means one thing: after the valley floor, every way is up.',
      },
      luckValue: 0,
    },
  ],
}
