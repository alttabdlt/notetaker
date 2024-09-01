import React from 'react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import Popup from './components/Popup';
import Options from './components/Options';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Popup />} />
        <Route path="/options" element={<Options />} />
      </Routes>
    </Router>
  );
}

export default App;