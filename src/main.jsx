import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Make sure App is imported
import './index.css';     // Make sure CSS is imported

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
