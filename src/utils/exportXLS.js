// 簡易 Excel 匯出（HTML→XLS，無需第三方套件）
// rows: [['標題1','標題2',...], ['資料1','資料2',...], ...]
import { downloadBlob } from './csv'

const XLS_MIME = 'application/vnd.ms-excel;charset=utf-8'

export function exportXLS(rows, filename = 'export.xls') {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8"></head><body><table border="1" style="border-collapse:collapse">',
    ...rows.map(r => '<tr>' + r.map(c => {
      const v = c == null ? '' : c
      const isNum = typeof v === 'number'
      return `<td${isNum ? ' x:num' : ''}>${esc(v)}</td>`
    }).join('') + '</tr>'),
    '</table></body></html>',
  ].join('')

  downloadBlob(filename.endsWith('.xls') ? filename : filename + '.xls', '﻿' + html, XLS_MIME)
}
