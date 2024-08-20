import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: Partial<UsersService>;
  let mockAuthService: Partial<AuthService>;

  beforeEach(async () => {
    mockUsersService = {
      findOne: (id: number) => {
        return Promise.resolve({
          id,
          email: 'asd@asd.com',
          password: '123123',
        } as User);
      },
      find: (email: string) => {
        return Promise.resolve([{ id: 1, email, password: '123123' } as User]);
      },
      // remove: () => {},
      // update: () => {},
    };
    mockAuthService = {
      signin: (email: string, password: string) => {
        return Promise.resolve({ id: 1, email, password } as User);
      },
      // signup: () => {},
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('find all users; return array of users', async () => {
    const users = await controller.findUsers('asd@asd.com');
    expect(users).toEqual([
      { id: 1, email: 'asd@asd.com', password: '123123' },
    ]);
  });

  it('find one user; return a user', async () => {
    const user = await controller.findUser('1');
    expect(user).toEqual({
      id: 1,
      email: 'asd@asd.com',
      password: '123123',
    });
  });

  it('should fail to find a user', async () => {
    mockUsersService.findOne = () => null;
    await expect(controller.findUser('2')).rejects.toThrow(NotFoundException);
  });

  it('sign in updates session object with user id', async () => {
    const session = { userId: -12 };
    await controller.signin(
      { email: 'asd@asd.com', password: '123123' },
      session,
    );
    expect(session).toEqual({ userId: 1 });
  });
});
