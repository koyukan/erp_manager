import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async signup(email: string, password: string) {
    // See if email is in use
    const users = await this.usersService.find(email);

    if (users.length) {
      throw new BadRequestException('Email in use');
    }

    // Hash the user's password

    // Generate a salt

    const salt = randomBytes(8).toString('hex');

    // Hash the salt and the password

    const hash = (await scrypt(password, salt, 32)) as Buffer;
    //Joint the hashed password and the salt

    const result = salt + '.' + hash.toString('hex');
    // Create a new user and save it
    const newUser = await this.usersService.create(email, result);
    // return the user
    return newUser;
  }
  async signin(email: string, password: string) {
    const [user] = await this.usersService.find(email);
    if (!user) {
      throw new NotFoundException('There is no user with this email');
    }
    const [salt, storedHash] = user.password.split('.');

    const hash = (await scrypt(password, salt, 32)) as Buffer;

    //compare the hashed password with the stored hash
    if (hash.toString('hex') !== storedHash) {
      throw new BadRequestException('Wrong password');
    }
    return user;
  }
}
