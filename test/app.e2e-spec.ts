import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { randomInt } from 'crypto';

describe('AppController (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    /**
     * 동시성 제어 및 통합 테스트 진행
     *
     * - 문제 파악
     *  동일한 유저의 동시 요청에 따라 보유 하고 있는 포인트 값이 누락 조회 되어 충전 결과값 또한 데이터가 누락이 된다.
     *  -> 요청 데이터는 전부 누락되고 마지막으로 완료된 userDb.insertOrUpdate()된 값 만 저장됨
     *
     * TODO: 서로 다른 유저들의 동시 요청으로 인한 병렬처리가 진행되는지 테스트 요함.
     *
     */

    const range = 100_000;

    describe('PATCH /point/:id/charge', () => {
        it('FAIL_같은 유저가 동시에 포인트 충전할 경우 최대 보유 금액이 초과하면 오류를 뱉는가?', async () => {
            // 최종 충전 금액은 요청한 충전 포인트의 합이여야 함.
            const limitPoint = 10_000_000;
            const user = randomInt(range);

            try {
                await Promise.all([
                    request(app.getHttpServer())
                        .patch(`/point/${user}/charge`)
                        .send({ amount: 5_000_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/charge`)
                        .send({ amount: 900_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/charge`)
                        .send({ amount: 2_000_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/charge`)
                        .send({ amount: 3_000_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/charge`)
                        .send({ amount: 500_000 }),
                ]);
            } catch (err) {
                expect(err).toThrow(BadRequestException);
                expect(err).toThrow('보유 금액을 초과했습니다.');
            }

            const userPoint = await request(app.getHttpServer()).get(`/point/${user}`);
            expect(userPoint.body.point).toBeLessThanOrEqual(limitPoint);
        });

        it('SUCCESS_같은 유저가 동시에 포인트 충전할 경우 순차적으로 처리 되는가?', async () => {
            // 최종 충전 금액은 요청한 충전 포인트의 합이여야 함.
            const user = randomInt(range);

            await Promise.all([
                request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 100 }),
                request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 123 }),
                request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 544 }),
                request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 321 }),
                request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 421 }),
            ]);

            const userPoint = await request(app.getHttpServer()).get(`/point/${user}`);
            expect(userPoint.body.point).toEqual(100 + 123 + 544 + 321 + 421);
        });

        it('SUCCESS_다른 유저가 동시에 포인트 충전할 경우 순차적으로 처리 되는가?', async () => {
            // 최종 충전 금액은 요청한 충전 포인트의 합이여야 함.
            const user1 = randomInt(range);
            const user2 = randomInt(range);
            const user3 = randomInt(range);

            await Promise.all([
                request(app.getHttpServer()).patch(`/point/${user1}/charge`).send({ amount: 100 }),
                request(app.getHttpServer()).patch(`/point/${user3}/charge`).send({ amount: 123 }),
                request(app.getHttpServer()).patch(`/point/${user2}/charge`).send({ amount: 544 }),
                request(app.getHttpServer()).patch(`/point/${user2}/charge`).send({ amount: 321 }),
                request(app.getHttpServer()).patch(`/point/${user1}/charge`).send({ amount: 421 }),
                request(app.getHttpServer()).patch(`/point/${user3}/charge`).send({ amount: 100 }),
            ]);

            const user1Point = await request(app.getHttpServer()).get(`/point/${user1}`);
            const user2Point = await request(app.getHttpServer()).get(`/point/${user2}`);
            const user3Point = await request(app.getHttpServer()).get(`/point/${user3}`);

            expect(user1Point.body.point).toEqual(521);
            expect(user2Point.body.point).toEqual(865);
            expect(user3Point.body.point).toEqual(223);
        });
    });

    describe('/PATCH /point/:id/use', () => {
        it('FAIL_같은 유저가 동시에 포인트 사용할 경우 사용 포인트가 보유 포인트를 초과하면 오류를 뱉는가? ', async () => {
            const user = randomInt(range);
            const chargePoint = 10_000;

            try {
                await request(app.getHttpServer())
                    .patch(`/point/${user}/charge`)
                    .send({ amount: chargePoint });

                await Promise.allSettled([
                    request(app.getHttpServer())
                        .patch(`/point/${user}/use`)
                        .send({ amount: 2_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/use`)
                        .send({ amount: 3_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/use`)
                        .send({ amount: 4_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/use`)
                        .send({ amount: 5_000 }),
                    request(app.getHttpServer())
                        .patch(`/point/${user}/use`)
                        .send({ amount: 8_000 }),
                ]);
            } catch (err) {
                expect(err).toThrow(BadRequestException);
                expect(err).toThrow('보유 금액을 확인해주세요.');
            }

            const userPointHistory = await request(app.getHttpServer()).get(
                `/point/${user}/histories`,
            );

            const totalUsePoint = userPointHistory.body
                .filter((v) => v.type === 1)
                .reduce((acc, curr) => acc + curr.amount, 0);

            //포인트 히스토리 내 총 사용 포인트 합은 충전 포인트와 같거나 작다.
            expect(totalUsePoint).toBeLessThanOrEqual(chargePoint);
        });

        it('SUCCESS_같은 유저가 동시에 포인트 사용할 경우 순차적으로 처리 되는가?', async () => {
            const user = randomInt(range);

            await request(app.getHttpServer())
                .patch(`/point/${user}/charge`)
                .send({ amount: 10_000 });

            await Promise.all([
                request(app.getHttpServer()).patch(`/point/${user}/use`).send({ amount: 4_000 }),
                request(app.getHttpServer()).patch(`/point/${user}/use`).send({ amount: 3_000 }),
                request(app.getHttpServer()).patch(`/point/${user}/use`).send({ amount: 1_000 }),
            ]);

            const userPoint = await request(app.getHttpServer()).get(`/point/${user}`);
            expect(userPoint.body.point).toEqual(2_000);
        });

        it('SUCCESS_다른 유저가 동시에 포인트 사용할 경우 순차적으로 처리되는가? ', async () => {
            const chargePoint = 10_000;

            const user1 = randomInt(range);
            const user2 = randomInt(range);
            const user3 = randomInt(range);

            for (const user of [user1, user2, user3]) {
                await request(app.getHttpServer())
                    .patch(`/point/${user}/charge`)
                    .send({ amount: chargePoint });
            }

            await Promise.allSettled([
                request(app.getHttpServer()).patch(`/point/${user1}/use`).send({ amount: 2_000 }),
                request(app.getHttpServer()).patch(`/point/${user2}/use`).send({ amount: 3_000 }),
                request(app.getHttpServer()).patch(`/point/${user1}/use`).send({ amount: 4_000 }),
                request(app.getHttpServer()).patch(`/point/${user3}/use`).send({ amount: 5_000 }),
                request(app.getHttpServer()).patch(`/point/${user2}/use`).send({ amount: 7_000 }),
            ]);

            const user1Point = await request(app.getHttpServer()).get(`/point/${user1}`);
            const user2Point = await request(app.getHttpServer()).get(`/point/${user2}`);
            const user3Point = await request(app.getHttpServer()).get(`/point/${user3}`);

            expect(user1Point.body.point).toEqual(4_000);
            expect(user2Point.body.point).toEqual(0);
            expect(user3Point.body.point).toEqual(5_000);
        });
    });
});
