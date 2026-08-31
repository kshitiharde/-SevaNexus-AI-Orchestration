import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('document')
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  applicationId: number;

  @Column()
  documentType: string;

  @Column()
  documentUrl: string;

  @Column({ default: false })
  verified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  uploadedAt: Date;
}