import React, { useEffect, useRef, useState } from 'react';
import { resetStampKey, syncClkkFolder } from './clkkFolderSync';

export default function ClkkFolderSync({ visible, onSaved, resetRevision }) {
  const [directory, setDirectory] = useState(null);
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState([]);
  const active = useRef(null);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const supported = typeof window.showDirectoryPicker === 'function' && !!navigator.locks && !!globalThis.crypto?.subtle;

  function stop(message) {
    active.current = null;
    setDirectory(null);
    setStatus(message);
    setIssues([]);
  }

  useEffect(() => {
    if (resetRevision) stop('Đã dừng đồng bộ sau Reset. Chọn lại thư mục để tiếp tục.');
  }, [resetRevision]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key === resetStampKey) stop('Đã dừng đồng bộ sau Reset. Chọn lại thư mục để tiếp tục.');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!directory) return;
    const run = {};
    active.current = run;
    let timer;
    const cancelled = () => active.current !== run;
    async function poll() {
      try {
        const { saved, issues } = await syncClkkFolder(directory, cancelled);
        if (cancelled()) return;
        setIssues(issues);
        if (saved) {
          setStatus(`Đã cập nhật dữ liệu từ ${directory.name} lúc ${new Date().toLocaleTimeString('vi-VN')}.`);
          savedCallback.current();
        }
      } catch (error) {
        if (!cancelled()) setIssues([error.message || 'Không đọc được thư mục đồng bộ.']);
      } finally {
        if (!cancelled()) timer = setTimeout(poll, 10000);
      }
    }
    poll();
    return () => {
      active.current = null;
      clearTimeout(timer);
    };
  }, [directory]);

  async function choose() {
    try {
      const folder = await window.showDirectoryPicker({ mode: 'read' });
      setIssues([]);
      setDirectory(folder);
      setStatus(`Đang theo dõi thư mục ${folder.name}.`);
    } catch (error) {
      if (error.name !== 'AbortError') setIssues([error.message]);
    }
  }

  return <section className="panel clkk" hidden={!visible}>
    <h2>Đồng bộ Excel từ thư mục máy</h2>
    <p>Giữ tab V10 mở. App kiểm tra thư mục khoảng 10 giây một lần và tự lưu các file phù hợp.</p>
    <details><summary>Tên file được nhận diện</summary>
      <ul>
        <li>Lịch KK.xlsx</li>
        <li>Up file trc và trong tháng KK.xlsx</li>
        <li>HCXL.xlsx</li>
        <li>DS nhan su.xlsx</li>
      </ul>
    </details>
    {supported
      ? <button type="button" onClick={directory ? () => stop('Đã dừng đồng bộ.') : choose}>{directory ? 'Dừng đồng bộ' : 'Chọn thư mục đồng bộ'}</button>
      : <p>Đồng bộ thư mục cần Chrome hoặc Edge trên máy tính và đường dẫn HTTPS.</p>}
    {status && <p role="status">{status}</p>}
    {issues.length > 0 && <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </section>;
}
