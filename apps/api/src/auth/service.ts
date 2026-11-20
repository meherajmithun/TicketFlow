import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './token.js';

export type Role = 'organizer' | 'customer';
export type User = { id: string; email: string; role: Role; passwordHash: string };
export type PublicUser = Pick<User, 'id' | 'email' | 'role'>;

export interface UserRepository {
  create(input: { email: string; passwordHash: string; role: Role }): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

export class AuthError extends Error {
  constructor(public readonly code: 'EMAIL_TAKEN' | 'INVALID_CREDENTIALS') {
    super(code === 'EMAIL_TAKEN' ? 'Email is already registered' : 'Invalid email or password');
  }
}

export class AuthService {
  constructor(private readonly users: UserRepository, private readonly tokenSecret: string) {}

  private session(user: User) {
    const publicUser: PublicUser = { id: user.id, email: user.email, role: user.role };
    return { user: publicUser, token: signToken({ sub: user.id, role: user.role }, this.tokenSecret) };
  }

  async register(input: { email: string; password: string; role: Role }) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({ email, passwordHash, role: input.role });
    if (!user) throw new AuthError('EMAIL_TAKEN');
    return this.session(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AuthError('INVALID_CREDENTIALS');
    }
    return this.session(user);
  }
}
