import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('application')
export class Application {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  citizenId: number;

  @Column()
  serviceId: number;

  @Column({ default: 'DRAFT' })
  status: string;

  @Column({ type: 'json', nullable: true })
  data: any;

  @Column({ nullable: true })
  submittedAt: Date;
}