const CUSTOMER_PROJECT_ID_KEY = 'customer_project_id';

export const getCustomerProjectId = () => {
  return localStorage.getItem(CUSTOMER_PROJECT_ID_KEY);
};

export const setCustomerProjectId = (projectId) => {
  if (projectId) {
    localStorage.setItem(CUSTOMER_PROJECT_ID_KEY, projectId);
  } else {
    localStorage.removeItem(CUSTOMER_PROJECT_ID_KEY);
  }
};

export const clearCustomerSession = () => {
  localStorage.removeItem(CUSTOMER_PROJECT_ID_KEY);
};
