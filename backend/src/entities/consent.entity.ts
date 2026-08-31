import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('consent')
export class Consent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  citizenId: number;

  @Column()
  serviceId: number;

  @Column({ type: 'simple-json' })
  scopes: string[];

  @Column({ default: true })
  granted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  grantedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;
}