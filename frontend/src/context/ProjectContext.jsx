import React, { createContext, useContext, useState, useEffect } from 'react';

const ProjectContext = createContext();

export function ProjectProvider({ children }) {
  const [selectedProject, setSelectedProject] = useState(() => {
    // Get stored project from localStorage
    return localStorage.getItem('selectedProject') || '';
  });

  useEffect(() => {
    // Store selected project in localStorage
    localStorage.setItem('selectedProject', selectedProject);
  }, [selectedProject]);

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
