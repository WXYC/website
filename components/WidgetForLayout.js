// components/WidgetForLayout.js

import React, { useState } from "react";
import { FiMinimize2, FiMaximize2 } from "react-icons/fi";
//import styles from "./WidgetForLayout.module.css"; // Import your CSS module

const WidgetForLayout = () => {
  const [isMinimized, setIsMinimized] = useState(false);

  const toggleMinimized = () => {
    setIsMinimized(!isMinimized);
  };

  const widgetStyle = {
    width: '100%',
    border: '0',
    overflow: 'hidden',
    height: isMinimized ? '16rem' : '25rem',
  };

  return (
    <div
      className={`relative ${
        // isMinimized ? "fixed bottom-5 right-5" : "lg:fixed lg:bottom-4 lg:right-4"
        isMinimized ? "lg:fixed lg:bottom-4 lg:right-4" : "fixed bottom-5 right-5 z-50" 
      }`}
    >
      <button onClick={toggleMinimized}>
        {isMinimized ? (
          <FiMaximize2 color="white" size={34} />
        ) : (
          <FiMinimize2 color="white" size={34} />
        )}
      </button>
      <iframe
        src={`https://dj.wxyc.org/#/NowPlaying?theme=dark`}
        className="border-0"
        style={widgetStyle}
      />
    </div>
  );
};

export default WidgetForLayout;
