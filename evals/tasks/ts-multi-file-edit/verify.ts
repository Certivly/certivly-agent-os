import { UserService, UserRecord } from './src';

const service = new UserService();
service.addUser({ id: '1', name: 'Alice', role: 'admin' });
service.addUser({ id: '2', name: 'Bob', role: 'user' });
service.addUser({ id: '3', name: 'Charlie', role: 'admin' });

const admins = service.getUsersByRole('admin');
if (admins.length !== 2 || admins[0].name !== 'Alice' || admins[1].name !== 'Charlie') {
  console.error('Failed to retrieve admins properly:', admins);
  process.exit(1);
}

const users = service.getUsersByRole('user');
if (users.length !== 1 || users[0].name !== 'Bob') {
  console.error('Failed to retrieve users properly:', users);
  process.exit(1);
}

console.log('Verification passed: multi-file edits and role filtering work correctly.');
process.exit(0);
