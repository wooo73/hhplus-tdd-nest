import { Test, TestingModule } from '@nestjs/testing';

import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';

import { PointService } from './point.service';

// 제약 조건 테스트 검증, 성공 로직 검증
describe('PointService', () => {
    let service: PointService;
    let userDb: jest.Mocked<UserPointTable>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PointService,
                {
                    provide: UserPointTable,
                    useValue: {
                        selectById: jest.fn(),
                        insertOrUpdate: jest.fn(),
                    },
                },
                {
                    provide: PointHistoryTable,
                    useValue: {
                        insert: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get(PointService);
        userDb = module.get(UserPointTable);
    });

    // given - when - then
    // 준비 - 실행 - 검증
    describe('포인트 충전 테스트', () => {
        it('FAIL_충전 포인트가 비정상적일 경우 사용이 안되는가?', async () => {
            await expect(service.chargePoint(1, 0)).rejects.toThrow('충전 금액을 확인해주세요.');
            await expect(service.chargePoint(1, -1)).rejects.toThrow('충전 금액을 확인해주세요.');
            await expect(service.chargePoint(1, null)).rejects.toThrow('충전 금액을 확인해주세요.');
            await expect(service.chargePoint(1, undefined)).rejects.toThrow(
                '충전 금액을 확인해주세요.',
            );
            await expect(service.chargePoint(1, NaN)).rejects.toThrow('충전 금액을 확인해주세요.');
        });

        it('FAIL_유저 정보가 없을 경우 오류가 발생하는가?', async () => {
            userDb.selectById.mockResolvedValue(null);
            await expect(service.chargePoint(1, 5)).rejects.toThrow(
                '유저 정보를 찾을 수 없습니다.',
            );
        });

        it('FAIL_충전 후 포인트가 10_000_000 이상일 경우 충전이 안되는가?', async () => {
            const userId = 10;
            const amount = 50_000;

            userDb.selectById.mockResolvedValue({
                id: userId,
                point: 9_999_999,
                updateMillis: Date.now(),
            });

            await expect(service.chargePoint(userId, amount)).rejects.toThrow(
                '보유 금액을 초과했습니다.',
            );
        });

        it('SUCCESS_존재하는 유저에 대해 정상적인 포인트 충전이 이뤄지는가?', async () => {
            // given
            const userId = 1;
            const amount = 5;

            // when
            userDb.selectById.mockImplementation(async (id) => ({
                id,
                point: 1,
                updateMillis: Date.now(),
            }));

            userDb.insertOrUpdate.mockImplementation(async (id, amount) => ({
                id,
                point: amount,
                updateMillis: Date.now(),
            }));

            const charge = await service.chargePoint(userId, amount);

            // then
            expect({ id: charge.id, point: charge.point }).toEqual({ id: userId, point: 6 });
        });
    });

    describe('포인트 사용 테스트', () => {
        it('FAIL_사용 포인트가 비정상일 경우 사용이 안되는가?', async () => {
            await expect(service.usePoint(1, 0)).rejects.toThrow('사용 금액을 확인해주세요.');
            await expect(service.usePoint(1, -1)).rejects.toThrow('사용 금액을 확인해주세요.');
            await expect(service.usePoint(1, null)).rejects.toThrow('사용 금액을 확인해주세요.');
            await expect(service.usePoint(1, undefined)).rejects.toThrow(
                '사용 금액을 확인해주세요.',
            );
            await expect(service.usePoint(1, NaN)).rejects.toThrow('사용 금액을 확인해주세요.');
        });

        it('FAIL_유저 정보가 없을 경우 오류가 발생하는가?', async () => {
            userDb.selectById = jest.fn().mockResolvedValue(null);
            await expect(service.usePoint(1, 5)).rejects.toThrow('유저 정보를 찾을 수 없습니다.');
        });

        it('FAIL_사용 포인트가 보유 포인트 보다 많을 경우 사용이 안되는가?', async () => {
            const userId = 10;
            const amount = 5;

            userDb.selectById.mockResolvedValue({ id: userId, point: 3, updateMillis: Date.now() });

            await expect(service.usePoint(userId, amount)).rejects.toThrow(
                '보유 금액을 확인해주세요.',
            );
        });

        it('SUCCESS_보유 금액에 대한 포인트 사용처리와 이력이 정상적으로 작동하는가?', async () => {
            // given
            const userId = 10;
            const amount = 3;
            const updateMillis = Date.now();

            // when
            userDb.selectById.mockResolvedValue({ id: userId, point: 5, updateMillis: Date.now() });
            userDb.insertOrUpdate.mockImplementation(async (id, amount) => ({
                id,
                point: amount,
                updateMillis,
            }));

            const usePoint = await service.usePoint(userId, amount);

            // then
            expect({ id: usePoint.id, point: usePoint.point }).toEqual({
                id: userId,
                point: 2,
            });
        });
    });
});
