import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Options.css';

function Options() {
  const [saveLocation, setSaveLocation] = useState('text');

  useEffect(() => {
    chrome.storage.local.get({ saveLocation: 'text' }, (result) => {
      setSaveLocation(result.saveLocation);
    });
  }, []);

  const handleSaveLocationChange = (event) => {
    const newSaveLocation = event.target.value;
    setSaveLocation(newSaveLocation);
    chrome.storage.local.set({ saveLocation: newSaveLocation });
  };

  return (
    <div className="container">
      <h1>Options</h1>
      <div className="options-content">
        <label>
          Default Save Location:
          <select value={saveLocation} onChange={handleSaveLocationChange}>
            <option value="notion">Notion</option>
            <option value="text">Text File</option>
            <option value="excel">Excel File</option>
            <option value="word">Word File</option>
          </select>
        </label>
      </div>
      <Link to="/">
        <button className="back-btn">Back</button>
      </Link>
    </div>
  );
}

export default Options;