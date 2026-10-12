import { UserRecord } from './types';

export class UserService {
  private users: UserRecord[] = [];

  addUser(user: UserRecord): void {
    this.users.push(user);
  }

  getUser(id: string): UserRecord | undefined {
    return this.users.find(u => u.id === id);
  }
}
