const fs = require('fs');
let code = fs.readFileSync('apps/web/app/dashboard/scrutiny/page.tsx', 'utf8');

const importStr = 'import { UserCombobox } from "@/components/ui/UserCombobox";\nimport { listScrutinyParticipants } from "@/lib/scrutiny-api";\n';
code = code.replace('import { useAuth }', importStr + 'import { useAuth }');

const wrapperStr = `
function UserSelect({ name, initialValue = "" }: { name: string; initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <UserCombobox
      name={name}
      value={value}
      onChange={setValue}
      fetchItems={(search, signal) => listScrutinyParticipants({ search, limit: 10 }, signal)}
    />
  );
}
`;
code = code.replace('export default function ScrutinyPage', wrapperStr + '\nexport default function ScrutinyPage');

// replace all occurrences of <select className={inputClass} name="legalLeadUserId"...> ... </select> with <UserSelect name="legalLeadUserId" initialValue={user?.id ?? ""} />
// We can use a regex.
code = code.replace(
  /<select\s+className=\{inputClass\}\s+name="legalLeadUserId"[\s\S]*?<\/select>/g,
  '<UserSelect name="legalLeadUserId" initialValue={user?.id ?? ""} />'
);

code = code.replace(
  /<select\s+className=\{inputClass\}\s+name="witnessId"[\s\S]*?<\/select>/g,
  '<UserSelect name="witnessId" />'
);

code = code.replace(
  /<select\s+className=\{inputClass\}\s+name="assigneeUserId"[\s\S]*?<\/select>/g,
  '<UserSelect name="assigneeUserId" />'
);

fs.writeFileSync('apps/web/app/dashboard/scrutiny/page.tsx', code);
