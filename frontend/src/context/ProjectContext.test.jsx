import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectProvider, useProject } from './ProjectContext';

const TestComponent = () => {
  const { selectedProjectId, setSelectedProjectId } = useProject();
  return (
    <div>
      <p data-testid="project-id">{selectedProjectId}</p>
      <button onClick={() => setSelectedProjectId('123')}>Set Project</button>
    </div>
  );
};

describe('ProjectContext', () => {
  it('should provide the selected project ID', () => {
    render(
      <ProjectProvider>
        <TestComponent />
      </ProjectProvider>
    );
    expect(screen.getByTestId('project-id')).toHaveTextContent('');
  });

  it('should update the selected project ID', () => {
    render(
      <ProjectProvider>
        <TestComponent />
      </ProjectProvider>
    );

    fireEvent.click(screen.getByText('Set Project'));
    expect(screen.getByTestId('project-id')).toHaveTextContent('123');
  });

  it('should persist the selected project ID in localStorage', () => {
    render(
      <ProjectProvider>
        <TestComponent />
      </ProjectProvider>
    );

    fireEvent.click(screen.getByText('Set Project'));
    expect(localStorage.getItem('selectedProject')).toBe('123');
  });
});
