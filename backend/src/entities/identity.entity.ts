import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('identity')
export class Identity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  citizenId: number;

  @Column()
  identityType: string;

  @Column()
  identityNumber: string;

  @Column({ default: false })
  verified: boolean;
}
