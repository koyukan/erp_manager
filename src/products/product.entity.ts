import { Entity, Column, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';
@Entity()
export class Product {
  @PrimaryColumn()
  barcode: string;

  @Column()
  name: string;

  @Column()
  warehouse: number;

  @Column()
  isle: number;

  @Column()
  rack: number;

  @Column({ nullable: true })
  imageUrl: string;

  @ManyToOne(() => User, (user) => user.products)
  user: User;
}
