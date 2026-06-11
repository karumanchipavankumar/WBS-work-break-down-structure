import React, { useContext } from 'react';
import { AuthContext } from './AuthContext';
import TimesheetGrid from './TimesheetGrid';

export default function EmployeeDashboard() {
  const { user } = useContext(AuthContext);

  return <TimesheetGrid employee={user} isAdmin={false} />;
}
