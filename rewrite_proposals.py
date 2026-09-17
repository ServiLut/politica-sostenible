import re

with open('apps/web/app/dashboard/proposals/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add UserCombobox import
content = content.replace(
    'import { useAccessibleDialog } from "@/lib/use-accessible-dialog";',
    'import { useAccessibleDialog } from "@/lib/use-accessible-dialog";\nimport { UserCombobox } from "@/components/ui/UserCombobox";'
)

# Add listProposalResponsibles import
content = content.replace(
    '  listProposals,',
    '  listProposals,\n  listProposalResponsibles,'
)

# Add search filters state and debounced search
content = content.replace(
    'const [categoryFilter, setCategoryFilter] = useState<',
    'const [searchQuery, setSearchQuery] = useState("");\n  const [debouncedSearch, setDebouncedSearch] = useState("");\n\n  useEffect(() => {\n    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);\n    return () => clearTimeout(timer);\n  }, [searchQuery]);\n\n  const [categoryFilter, setCategoryFilter] = useState<'
)

# Add ownerId to form state
content = content.replace(
    '  internalDistributionFlag: boolean;',
    '  internalDistributionFlag: boolean;\n  ownerId: string;'
)
content = content.replace(
    '  internalDistributionFlag: false,',
    '  internalDistributionFlag: false,\n  ownerId: "",'
)

# Update openEdit to include ownerId
content = content.replace(
    '      internalDistributionFlag: proposal.isPublic,',
    '      internalDistributionFlag: proposal.isPublic,\n      ownerId: proposal.ownerId,'
)

# Add optimistic update for status changes
quick_status = """
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    Cambiar estado rápido
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const newStatus = e.target.value as ProposalStatus;
                      if (!newStatus) return;
                      // Optimistic update
                      setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: newStatus } : p));
                      updateProposal(proposal.id, { status: newStatus }).catch(() => {
                         // Revert
                         void loadProposals();
                      });
                    }}
                    disabled={!canMutate}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="">Seleccionar transición...</option>
                    {allowedProposalStatuses(proposal.status).map((st) => (
                      <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                    ))}
                  </select>
                </div>
"""
content = content.replace(
    '                </div>\n              </div>\n            </article>',
    '                </div>\n' + quick_status + '\n              </div>\n            </article>'
)

# Update submitForm payload to include ownerId
content = content.replace(
    '      isPublic: form.internalDistributionFlag,\n    };',
    '      isPublic: form.internalDistributionFlag,\n      ownerId: form.ownerId || undefined,\n    };'
)

# Replace the text "Responsable: ..." in the dialog with UserCombobox
content = content.replace(
    '<p className="mt-1 text-xs text-slate-500">\n                  Responsable:{" "}\n                  {dialogProposal === "new"\n                    ? user.name\n                    : dialogProposal.owner.name}\n                </p>',
    '<p className="mt-1 text-xs text-slate-500">\n                  Creador: {dialogProposal === "new" ? user.name : dialogProposal.owner.name}\n                </p>'
)

# Add UserCombobox to form
user_combo = """
                <label className="block text-sm font-black text-slate-800">
                  Responsable
                  <div className="mt-2">
                    <UserCombobox
                      value={form.ownerId}
                      onChange={(val) => setForm({ ...form, ownerId: val })}
                      fetchItems={(search, signal) => listProposalResponsibles({ search, limit: 10 }, signal)}
                    />
                  </div>
                </label>
"""
content = content.replace(
    '              <div className="grid gap-4 sm:grid-cols-2">',
    '              <div className="grid gap-4 sm:grid-cols-2">\n' + user_combo
)

# Apply debounced search to filtered proposals
content = content.replace(
    '        if (statusFilter !== "ALL" && proposal.status !== statusFilter) {\n          return false;\n        }',
    '        if (debouncedSearch && !proposal.title.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;\n        if (statusFilter !== "ALL" && proposal.status !== statusFilter) {\n          return false;\n        }'
)
content = content.replace(
    '[categoryFilter, proposals, statusFilter]',
    '[categoryFilter, proposals, statusFilter, debouncedSearch]'
)

# Add search input UI
search_ui = """
        <div className="flex-1 max-w-sm">
          <input
            type="search"
            placeholder="Buscar propuestas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
"""
content = content.replace(
    '      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">',
    '      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">\n' + search_ui
)

# Save changes
with open('apps/web/app/dashboard/proposals/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
