import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell } from 'docx';
import * as XLSX from 'xlsx';
import './Popup.css';

const SNIPS_PER_PAGE = 4;

function Popup() {
  const [snips, setSnips] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [saveLocation, setSaveLocation] = useState('text');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [hiddenUrls, setHiddenUrls] = useState({});

  useEffect(() => {
    chrome.storage.local.get({ snips: [], saveLocation: 'text' }, (result) => {
      setSnips(result.snips);
      setSaveLocation(result.saveLocation);
      console.log("Fetched snips and save location:", result.snips, result.saveLocation);
    });
  }, []);

  const deleteSnip = (index) => {
    const updatedSnips = snips.filter((_, i) => i !== index);
    chrome.storage.local.set({ snips: updatedSnips }, () => {
      setSnips(updatedSnips);
      console.log("Snip deleted. Total snips:", updatedSnips.length);
    });
  };

  const copySnip = (snip, index) => {
    let content = snip.content;
    
    if (content.includes('[TwitterImage:') || content.includes('[YouTubeImage:') || content.includes('[Image:')) {
      const imageUrl = content.match(/\[(TwitterImage|YouTubeImage|Image): (.*?)\]/)[2];
      
      fetch(imageUrl)
        .then(res => res.blob())
        .then(blob => {
          const item = new ClipboardItem({ [blob.type]: blob });
          navigator.clipboard.write([item]).then(() => {
            console.log('Image copied to clipboard');
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
          }, (err) => {
            console.error('Could not copy image: ', err);
            // Fallback to copying URL
            navigator.clipboard.writeText(imageUrl);
          });
        })
        .catch(err => {
          console.error('Error fetching image:', err);
          // Fallback to copying URL
          navigator.clipboard.writeText(imageUrl);
        });
    } else {
      // Handle text content (unchanged)
      const fullSnip = `${content}\n\nSource: ${snip.url}\nDate: ${new Date(snip.timestamp).toLocaleString()}`;
      navigator.clipboard.writeText(fullSnip).then(() => {
        console.log('Snip copied to clipboard');
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }, (err) => {
        console.error('Could not copy text: ', err);
      });
    }
  };

  const exportToWord = () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: snips.map(snip => {
            const children = [];

            if (snip.content.includes('[Table:')) {
              // Add table to Word document
              children.push(new Table({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph(snip.content)],
                      }),
                    ],
                  }),
                ],
              }));
            } else if (snip.content.includes('[Video:') || snip.content.includes('[Audio:')) {
              // Add link to video/audio
              const url = snip.content.match(/\[(Video|Audio): (.*?)\]/)[2];
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: `${snip.content.includes('[Video:') ? 'Video' : 'Audio'}: `,
                    bold: true,
                  }),
                  new TextRun({
                    text: url,
                    style: "Hyperlink",
                  }),
                ],
              }));
            } else if (snip.content.includes('[Image:')) {
              // Add image to Word document
              const imageUrl = snip.content.match(/\[Image: (.*?)\]/)[1];
              children.push(new ImageRun({
                data: fetch(imageUrl).then(r => r.arrayBuffer()),
                transformation: {
                  width: 200,
                  height: 200,
                },
              }));
            } else {
              // Add text content
              children.push(new Paragraph(snip.content));
            }

            // Add metadata if available
            if (snip.metadata) {
              const metadata = JSON.parse(snip.metadata);
              children.push(new Paragraph({
                children: [
                  new TextRun({
                    text: `Metadata: ${JSON.stringify(metadata, null, 2)}`,
                    size: 20,
                    color: "gray",
                  }),
                ],
              }));
            }

            // Add source and date
            children.push(new Paragraph({
              children: [
                new TextRun({
                  text: `\nSource: ${snip.url}\nDate: ${new Date(snip.timestamp).toLocaleString()}`,
                  italics: true,
                  size: 20,
                }),
              ],
            }));

            return children;
          }).flat(),
        },
      ],
    });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, "snips.docx");
    });
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(snips);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Snips");
    XLSX.writeFile(workbook, "snips.xlsx");
  };

  const exportToText = () => {
    const textContent = snips.map(snip => `${snip.content}\n${snip.url}\n${new Date(snip.timestamp).toLocaleString()}`).join('\n\n');
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "snips.txt");
  };

  const handleExport = () => {
    if (saveLocation === 'word') {
      exportToWord();
    } else if (saveLocation === 'excel') {
      exportToExcel();
    } else {
      exportToText();
    }
  };

  const totalPages = Math.ceil(snips.length / SNIPS_PER_PAGE);
  const displayedSnips = snips.slice((currentPage - 1) * SNIPS_PER_PAGE, currentPage * SNIPS_PER_PAGE);

  const toggleUrlVisibility = (index) => {
    setHiddenUrls(prev => ({...prev, [index]: !prev[index]}));
  };

  const renderContent = (content) => {
    if (!content) {
      console.error("Received null or undefined content");
      return <p>No content available</p>;
    }

    if (content.includes('[TwitterImage:') || content.includes('[YouTubeImage:') || content.includes('[Image:')) {
      const imageUrl = content.match(/\[(TwitterImage|YouTubeImage|Image): (.*?)\]/)[2];
      return (
        <div>
          <img src={imageUrl} alt="Snipped content" className="snipped-image" />
        </div>
      );
    } else if (content.includes('[Table:')) {
      const tableContent = content.match(/\[Table:\n([\s\S]*?)\n\]/)[1];
      const rows = tableContent.split('\n').map(row => row.split(' | '));
      return (
        <table className="captured-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else if (content.includes('[Video:')) {
      const videoUrl = content.match(/\[Video: (.*?)\]/)[1];
      return <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="video-link">Watch Video</a>;
    } else if (content.includes('[Audio:')) {
      const audioUrl = content.match(/\[Audio: (.*?)\]/)[1];
      return <audio controls src={audioUrl} className="audio-player"></audio>;
    } else if (content.includes('[Link:')) {
      const [, text, url] = content.match(/\[Link: (.*?) \((.*?)\)\]/);
      return <a href={url} target="_blank" rel="noopener noreferrer">{text}</a>;
    } else if (content.includes('[Code Snippet:')) {
      const code = content.match(/\[Code Snippet:\n([\s\S]*?)\n\]/)[1];
      return <pre className="code-snippet">{code}</pre>;
    } else if (content.includes('[SVG Graphic:')) {
      const svg = content.match(/\[SVG Graphic: (.*?)\]/)[1];
      return <div dangerouslySetInnerHTML={{ __html: svg }} className="svg-graphic"></div>;
    } else {
      return <pre className="snippet-text">{content}</pre>;
    }
  };

  return (
    <div className="container">
      <h1>Web Snipper</h1>
      {displayedSnips.map((snip, index) => {
        if (!snip || !snip.content) {
          console.error("Invalid snip object:", snip);
          return null; // Skip rendering this snip
        }
        return (
          <div key={index} className="snippet-card">
            {renderContent(snip.content)}
            <div className="snippet-info">
              <div className="snippet-url-container">
                <button className="toggle-url-btn" onClick={() => toggleUrlVisibility(index)}>
                  {hiddenUrls[index] ? '▼' : '▲'}
                </button>
                {!hiddenUrls[index] && <div className="snippet-url">{snip.url}</div>}
              </div>
              <div className="snippet-date">{new Date(snip.timestamp).toLocaleString()}</div>
              <div className="snippet-metadata">
                {snip.metadata && (
                  <details>
                    <summary>Metadata</summary>
                    <pre>{JSON.stringify(JSON.parse(snip.metadata), null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
            <div className="snippet-actions">
              <button 
                className={`copy-btn ${copiedIndex === index ? 'copied' : ''}`} 
                onClick={() => copySnip(snip, index)}
              >
                <i className="fas fa-copy"></i>
                {copiedIndex === index && <span className="copied-text">Copied!</span>}
              </button>
              <button className="delete-btn" onClick={() => deleteSnip((currentPage - 1) * SNIPS_PER_PAGE + index)}>
                <i className="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        );
      })}
      <div className="pagination">
        <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>
        <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
      </div>
      <div className="action-buttons">
        <button className="action-btn" onClick={handleExport}>Export</button>
        <Link to="/options">
          <button className="action-btn">Options</button>
        </Link>
      </div>
    </div>
  );
}

export default Popup;