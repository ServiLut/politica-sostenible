const fs = require('fs');
let content = fs.readFileSync('apps/web/app/dashboard/executive/page.tsx', 'utf8');

const targetStart = content.indexOf('<div className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">\\n          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">\\n            Ruta de activación');

if (targetStart === -1) {
    console.error('Target not found in executive/page.tsx');
    process.exit(1);
}

// Find the end of this div block. It ends right before </section>
const sectionEnd = content.indexOf('</section>', targetStart);
if (sectionEnd === -1) {
    console.error('Section end not found');
    process.exit(1);
}

// Actually let's just find the exact string to replace. I have it from the view_file.
const targetPattern = /<div className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">[\\s\\S]*?Ruta de activación[\\s\\S]*?<\/div>\n        <\/div>/;
const newContent = content.replace(targetPattern, '<ActivationChecklist briefing={briefing} loading={loading} />');

fs.writeFileSync('apps/web/app/dashboard/executive/page.tsx', newContent);
console.log('Replaced executive');
