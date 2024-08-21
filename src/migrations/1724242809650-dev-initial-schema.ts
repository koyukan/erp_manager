import { MigrationInterface, QueryRunner } from "typeorm";

export class DevInitialSchema1724242809650 implements MigrationInterface {
    name = 'DevInitialSchema1724242809650'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_product" ("barcode" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "warehouse" integer NOT NULL, "isle" integer NOT NULL, "rack" integer NOT NULL, "userId" integer, "imageUrl" varchar, CONSTRAINT "FK_329b8ae12068b23da547d3b4798" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_product"("barcode", "name", "warehouse", "isle", "rack", "userId") SELECT "barcode", "name", "warehouse", "isle", "rack", "userId" FROM "product"`);
        await queryRunner.query(`DROP TABLE "product"`);
        await queryRunner.query(`ALTER TABLE "temporary_product" RENAME TO "product"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" RENAME TO "temporary_product"`);
        await queryRunner.query(`CREATE TABLE "product" ("barcode" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "warehouse" integer NOT NULL, "isle" integer NOT NULL, "rack" integer NOT NULL, "userId" integer, CONSTRAINT "FK_329b8ae12068b23da547d3b4798" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "product"("barcode", "name", "warehouse", "isle", "rack", "userId") SELECT "barcode", "name", "warehouse", "isle", "rack", "userId" FROM "temporary_product"`);
        await queryRunner.query(`DROP TABLE "temporary_product"`);
    }

}
