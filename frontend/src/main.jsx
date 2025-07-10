import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import UploadPage from './pages/UploadPage';
import RecordPage from './pages/RecordPage';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/record" element={<RecordPage />} />
    </Routes>
  </BrowserRouter>
);
