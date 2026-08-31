import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit')
export class Audit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column({ nullable: true })
  citizenId: number;

  @Column({ nullable: true })
  performedBy: string;

  @Column({ type: 'simple-json', nullable: true })
  details: any;

  @CreateDateColumn()
  createdAt: Date;
}