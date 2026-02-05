import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generatePDFReport = (data: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // --- HEADER ---
  // Brand Color Strip
  doc.setFillColor(30, 58, 138); // Blue 900
  doc.rect(0, 0, pageWidth, 25, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME EJECUTIVO DE CAMPAÑA', 14, 16);

  // Subtitle / Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el: ${new Date(data.generatedAt).toLocaleString()}`, 14, 22);
  doc.text(`Solicitado por: ${data.user.name} (${data.user.role})`, pageWidth - 14, 22, { align: 'right' });

  let finalY = 35;

  // --- SECTION 1: EXECUTIVE SUMMARY (KPIs) ---
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Resumen Estratégico', 14, finalY);
  
  // KPI Boxes
  const kpiY = finalY + 8;
  const boxWidth = 40;
  const boxHeight = 25;
  const gap = 10;
  let currentX = 14;

  const kpis = [
    { label: 'Votos Proyectados', value: data.stats.totalVotes.toLocaleString() },
    { label: 'Cobertura (Zonas)', value: data.stats.activeTerritories.toString() },
    { label: 'Ejecución PPT', value: `${Math.round(data.stats.budgetProgress)}%` },
    { label: 'Gasto Total', value: `$${(data.stats.executedBudget/1000000).toFixed(1)}M` }
  ];

  kpis.forEach((kpi) => {
    doc.setFillColor(241, 245, 249); // Slate 100
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.roundedRect(currentX, kpiY, boxWidth, boxHeight, 3, 3, 'FD');
    
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.setFontSize(8);
    doc.text(kpi.label, currentX + boxWidth/2, kpiY + 8, { align: 'center' });
    
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, currentX + boxWidth/2, kpiY + 18, { align: 'center' });

    currentX += boxWidth + gap;
  });

  finalY = kpiY + boxHeight + 15;

  // --- SECTION 2: TERRITORIAL PERFORMANCE ---
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Desempeño Territorial (Top 10)', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Territorio', 'Nivel', 'Simpatizantes', 'Estado']],
    body: data.territories.map((t: any) => [
      t.name,
      t.level.toUpperCase(),
      t.count,
      t.count < 10 ? 'CRÍTICO' : t.count > 50 ? 'SÓLIDO' : 'CRECIMIENTO'
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9 }
  });

  // @ts-ignore
  finalY = doc.lastAutoTable.finalY + 15;

  // --- SECTION 3: FINANCIAL & TEAM ---
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(14);
  doc.text('3. Control Financiero y Equipo', 14, finalY);

  // Split into two columns logic (Expenses Left, Recruiters Right) - simplified to stacked for safety
  
  // Expenses Table
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('Últimos Gastos Registrados', 14, finalY + 8);

  autoTable(doc, {
    startY: finalY + 12,
    head: [['Concepto', 'Responsable', 'Fecha', 'Monto']],
    body: data.expenses.map((e: any) => [
        e.category,
        e.user,
        new Date(e.date).toLocaleDateString(),
        `$${e.amount.toLocaleString()}`
    ]),
    theme: 'striped',
    headStyles: { fillColor: [71, 85, 105] },
    styles: { fontSize: 8 }
  });

  // @ts-ignore
  finalY = doc.lastAutoTable.finalY + 15;

  // Recruiters Table
  if (finalY > 250) { doc.addPage(); finalY = 20; }
  
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('Líderes con Mayor Tracción', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Nombre', 'Rol', 'Registros']],
    body: data.recruiters.map((r: any) => [
        r.name,
        r.role,
        r.count
    ]),
    theme: 'plain',
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 2: { fontStyle: 'bold', textColor: [30, 58, 138] } }
  });

  // --- FOOTER ---
  const totalPages = doc.internal.pages.length - 1; // jsPDF counts 1 based but array has extra?
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${totalPages} - Documento Confidencial - CRM Político V4.2`, pageWidth / 2, 290, { align: 'center' });
  }

  // Save
  doc.save(`Informe_Gestion_${new Date().toISOString().split('T')[0]}.pdf`);
};
