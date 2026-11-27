import base from './style.css?inline';
import redesign from './redesign.css?inline';
import dashboard from './dashboard.css?inline';

export function saveDashboardSnapshot(root, industry, print = false) {
  if (!root) throw new Error('Không tìm thấy Dashboard.');
  const clone = root.cloneNode(true);
  const label = root.querySelector('.dashboard-industry-select')?.selectedOptions[0]?.textContent || 'Tất cả MCH3';
  clone.querySelector('.dashboard-controls')?.remove();
  clone.querySelector('.dashboard-period-picker')?.remove();
  clone.querySelectorAll('button, [role="status"]').forEach(el => el.remove());
  const meta = document.createElement('p');
  meta.className = 'dashboard-caption';
  meta.textContent = `Ngành hàng: ${label} | Sao lưu: ${new Date().toLocaleString('vi-VN')} | MCH2: toàn bộ DSCL`;
  clone.querySelector('.dashboard-toolbar > div')?.append(meta);
  const doc = document.implementation.createHTMLDocument('Dashboard kiểm kê');
  doc.documentElement.lang = 'vi';
  const charset = doc.createElement('meta'); charset.setAttribute('charset','utf-8'); doc.head.prepend(charset);
  const viewport = doc.createElement('meta'); viewport.name='viewport'; viewport.content='width=device-width, initial-scale=1'; doc.head.append(viewport);
  const style = doc.createElement('style');
  style.textContent = [base, redesign, dashboard, `body{padding:20px;max-width:1500px;margin:auto}.dashboard-scroll{max-height:none!important;overflow:visible!important}.dashboard-scroll th{position:static}.dashboard-mch-table{white-space:normal}.dashboard-ranking{grid-template-columns:minmax(0,1fr)}.dashboard-panel{align-content:start} @media print{@page{size:A4 landscape;margin:10mm}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{padding:0;background:white}.dashboard-view,.dashboard-panel,.dashboard-split,.dashboard-ranking{display:block}.dashboard-view>*,.dashboard-split>*,.dashboard-ranking>li{margin-bottom:10px}.dashboard-product-card,.dashboard-mch2-group,.dashboard-kpis,tr{break-inside:avoid}.dashboard-panel h2{break-after:avoid}thead{display:table-header-group}.dashboard-scroll{overflow:visible!important}}`].join('\n');
  doc.head.append(style); doc.body.append(clone);
  const html = '<!doctype html>\n' + doc.documentElement.outerHTML;
  if (print) {
    const win = window.open('', '_blank');
    if (!win) throw new Error('Vui lòng cho phép mở cửa sổ in.');
    win.opener = null; win.document.open(); win.document.write(html); win.document.close();
    Promise.resolve(win.document.fonts?.ready).then(() => {win.focus();win.print();});
  } else {
    const url = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=`Dashboard_${new Date().toISOString().slice(0,10)}.html`; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 30000);
  }
}
