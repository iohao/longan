// 用于批量为 recommended-skills.json 中的技能添加英文描述
// 由于我们无法调用翻译 API，这里使用预设的简单映射表

import fs from 'fs';

// 预设常见技能的英文名称和简短描述
const skillDescriptions = {
  // Top 热门 already have descriptions
  'vercel-labs/skills/find-skills': 'CLI management tool for skills.sh ecosystem',
  'anthropics/skills/frontend-design': 'Official frontend design aesthetics guide',
  'vercel-labs/agent-skills/vercel-react-best-practices': 'React/Next.js performance optimization rules',
  'vercel-labs/agent-browser/agent-browser': 'Browser automation for AI agents',
  'mattpocock/skills/grill-me': 'Architecture review and design questioning',
  'vercel-labs/agent-skills/web-design-guidelines': 'UI code style and accessibility checker',
  'microsoft/azure-skills/microsoft-foundry': 'Azure AI Foundry agent lifecycle tools',
  'remotion-dev/skills/remotion-best-practices': 'Video generation with React',
  'mattpocock/skills/improve-codebase-architecture': 'Codebase architecture health inspection',
  'mattpocock/skills/tdd': 'Test-driven development discipline',
  
  //obra skills
  'obra/superpowers/brainstorming/scripts/start-server': 'Start brainstorm server instance',
  'obra/superpowers/brainstorming/scripts/stop-server': 'Stop brainstorm server and cleanup',
  
  // Add more as needed...
};

// 获取文件名作为简单的英文名称
function getSimpleName(id, name, source) {
  return name.split('/').pop() || id.split('/').pop();
}

// 生成简短英文描述
function generateSimpleEnglishDescription(skill) {
  const { id, name, source, description } = skill;
  
  if (skillDescriptions[id]) {
    return skillDescriptions[id];
  }
  
  // 如果已有英文描述则跳过
  if (skill.descriptionEnglish && !skill.descriptionEnglish.includes('[')) {
    return skill.descriptionEnglish;
  }
  
  // 简单规则：提取名称作为描述一部分
  const shortName = name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const category = skill.category || 'Utility';
  
  // 根据类别生成基础模板
  const templates = [
    `${shortName} - ${category.toLowerCase()} template`,
    `${shortName}: ${category} solution`,
    `Basic ${category.toLowerCase()} script for ${shortName}`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

// 读取文件
const filePath = './public/recommended-skills.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log(`Processing ${data.length} skills...`);

// 更新每个技能
let updatedCount = 0;
data.forEach((skill, index) => {
  if (!skill.descriptionEnglish) {
    skill.descriptionEnglish = generateSimpleEnglishDescription(skill);
    updatedCount++;
  } else if (skill.descriptionEnglish.startsWith('[TODO') || 
             skill.descriptionEnglish.endsWith('[TODO]')) {
    skill.descriptionEnglish = generateSimpleEnglishDescription(skill);
    updatedCount++;
  }
});

// 保存回文件
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

console.log(`✅ Updated ${updatedCount} skills with English descriptions`);
console.log(`📄 Total skills: ${data.length}`);
console.log(`💡 Sample updated entries:`);
data.slice(0, 3).forEach(s => {
  console.log(`   - ${s.name}: ${s.descriptionEnglish}`);
});
