import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace standard #HEX hardcodes with var(--theme)
content = content.replace(/bg-\[\#131314\]/g, 'bg-[var(--bg-main)]');
content = content.replace(/bg-gradient-to-t from-\[\#131314\] via-\[\#131314\]/g, 'bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)]');
content = content.replace(/bg-\[\#1e1f20\]/g, 'bg-[var(--bg-sidebar)]');
content = content.replace(/bg-\[\#212325\]/g, 'bg-[var(--bg-sidebar)]');
content = content.replace(/bg-\[\#1a1b1c\]/g, 'bg-[var(--bg-chat-hover)]');
content = content.replace(/bg-\[\#242526\]/g, 'bg-[var(--bg-chat-hover)]');
content = content.replace(/bg-\[\#2b2c2d\]/g, 'bg-[var(--bg-user-bubble)]');
content = content.replace(/bg-\[\#2a2b2d\]/g, 'bg-[var(--bg-chat-active)]');

content = content.replace(/hover:bg-\[\#1a1b1c\]/g, 'hover:bg-[var(--bg-chat-hover)]');
content = content.replace(/hover:bg-\[\#2b2c2d\]/g, 'hover:bg-[var(--bg-chat-active)]');
content = content.replace(/hover:bg-\[\#343538\]/g, 'hover:bg-[var(--bg-user-bubble)]');

content = content.replace(/text-\[\#e3e3e3\]/g, 'text-[var(--text-primary)]');
content = content.replace(/text-white/g, 'text-[var(--text-primary)]');
content = content.replace(/text-gray-100/g, 'text-[var(--text-primary)]');
content = content.replace(/text-gray-200/g, 'text-[var(--text-primary)]');
content = content.replace(/text-gray-300/g, 'text-[var(--text-primary)]');
content = content.replace(/text-gray-400/g, 'text-[var(--text-secondary)]');
content = content.replace(/text-gray-500/g, 'text-[var(--text-placeholder)]');
content = content.replace(/text-black/g, 'text-[var(--bg-main)]');

content = content.replace(/text-\[\#131314\]/g, 'text-[var(--bg-main)]');

content = content.replace(/bg-gray-800/g, 'bg-[var(--bg-chat-active)]');
content = content.replace(/hover:bg-gray-800/g, 'hover:bg-[var(--bg-user-bubble)]');
content = content.replace(/hover:bg-gray-700/g, 'hover:bg-[var(--bg-user-bubble)]');

content = content.replace(/border-gray-800\/50/g, 'border-[var(--border-light)]');
content = content.replace(/border-gray-800\/80/g, 'border-[var(--border-light)]');
content = content.replace(/border-gray-700\/50/g, 'border-[var(--border-light)]');
content = content.replace(/border-gray-800/g, 'border-[var(--border-main)]');
content = content.replace(/border-gray-700/g, 'border-[var(--border-main)]');
content = content.replace(/border-gray-600/g, 'border-[var(--border-main)]');

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx Tailwind colors replaced successfully');
