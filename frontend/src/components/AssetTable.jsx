function AssetTable({
  panels,
  title = 'Equipment register',
  emptyMessage = 'No equipment found.',
  onEditPanel,
  onDeletePanel,
  onEditLoop,
  onDeleteLoop,
  onEditMeter,
  onDeleteMeter,
  onAddLoop,
  onAddMeter,
}) {
  return (
    <div className="table-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Asset Register</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="asset-tree">
        {panels.map((panel) => (
          <article key={panel.id} className="asset-panel-card">
            <div className="job-item compact-item">
              <div>
                <h3>{panel.panel_code} - {panel.panel_name}</h3>
                <p>{panel.serial_number || 'No serial'} | {panel.location_note || 'No location note'}</p>
              </div>
              <div className="button-row">
                {onAddLoop && <button type="button" className="ghost-btn" onClick={() => onAddLoop(panel)}>Add loop</button>}
                {onEditPanel && <button type="button" className="ghost-btn" onClick={() => onEditPanel(panel)}>Edit</button>}
                {onDeletePanel && <button type="button" className="ghost-btn" onClick={() => onDeletePanel(panel)}>Delete</button>}
              </div>
            </div>

            <div className="detail-stack asset-loop-stack">
              {panel.loops.map((loop) => (
                <div key={loop.id} className="asset-loop-card">
                  <div className="job-item compact-item">
                    <div>
                      <h3>{loop.loop_code} - {loop.loop_name}</h3>
                      <p>{loop.converter_ip || loop.converter_name || 'No converter'} | {loop.mac_address || 'No MAC'}</p>
                    </div>
                    <div className="button-row">
                      {onAddMeter && <button type="button" className="ghost-btn" onClick={() => onAddMeter(loop)}>Add meter</button>}
                      {onEditLoop && <button type="button" className="ghost-btn" onClick={() => onEditLoop(loop)}>Edit</button>}
                      {onDeleteLoop && <button type="button" className="ghost-btn" onClick={() => onDeleteLoop(loop)}>Delete</button>}
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Meter</th>
                          <th>Serial</th>
                          <th>Address</th>
                          <th>Model</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loop.meters.map((meter) => (
                          <tr key={meter.id}>
                            <td>{meter.meter_name}<div className="muted-text">{meter.meter_code}</div></td>
                            <td>{meter.serial_number || '-'}</td>
                            <td>{meter.device_address || '-'}</td>
                            <td>{meter.model || '-'}</td>
                            <td><span className={`status ${meter.status === 'Active' ? 'active' : 'warning'}`}>{meter.status}</span></td>
                            <td>
                              <div className="button-row">
                                {onEditMeter && <button type="button" className="ghost-btn" onClick={() => onEditMeter(meter, loop)}>Edit</button>}
                                {onDeleteMeter && <button type="button" className="ghost-btn" onClick={() => onDeleteMeter(meter)}>Delete</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {loop.meters.length === 0 && (
                          <tr>
                            <td colSpan="6" className="empty-row">No meters in this loop yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {panel.loops.length === 0 && <p className="empty-panel">No loops in this panel yet.</p>}
            </div>
          </article>
        ))}
        {panels.length === 0 && <p className="empty-panel">{emptyMessage}</p>}
      </div>
    </div>
  );
}

export default AssetTable;
