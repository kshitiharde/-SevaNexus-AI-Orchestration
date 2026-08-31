import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('service')
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @Column({ default: true })
  active: boolean;
}