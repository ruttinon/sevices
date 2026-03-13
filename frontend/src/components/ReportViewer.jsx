import { Download, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toAbsoluteFileUrl } from '../api/api';

function ReportViewer({
  reports,
  title = 'Generated reports',
  description = 'Download PDF and spreadsheet exports from recent service jobs.',
  emptyMessage = 'No reports available yet.',
}) {
  return (
    <div className="table-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>{title}</h2>
          <p className="section-copy">{description}</p>
        </div>
      </div>

      <div className="report-list">
        {reports.map((report) => {
          const isExcel = report.file_path.toLowerCase().endsWith('.xlsx');
          return (
            <div key={report.id} className="report-item-wrapper">
              <a
                className="report-item"
                href={toAbsoluteFileUrl(report.file_path)}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <strong>{report.file_path.split('/').pop()}</strong>
                  <p>{new Date(report.created_at).toLocaleString()}</p>
                </div>
                <Download size={18} />
              </a>
              {isExcel && (
                <Link to={`/customer/online-report/${report.id}`} className="report-view-online-btn">
                  <Eye size={16} />
                  <span>ดูออนไลน์</span>
                </Link>
              )}
            </div>
          );
        })}
        {reports.length === 0 && <p className="empty-panel">{emptyMessage}</p>}
      </div>
    </div>
  );
}

export default ReportViewer;
