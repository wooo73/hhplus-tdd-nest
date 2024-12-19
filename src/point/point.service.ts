import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PointHistoryTable } from '../database/pointhistory.table';
import { UserPointTable } from '../database/userpoint.table';
import { TransactionType } from '../point/point.model';

/**
 * 동시성 제어 플로우
 * 첫 진입 -> 유저 요청 -> Map내 해당 유저 ID 존재 여부 확인 -> Mutex 인스턴스 생성 -> Mutex 인스턴스 잠금 활성 후 비즈니스 로직 실행 -> 잠금 해제 후 Map내 해당 유저 ID 삭제
 *
 * 1. 같은 유저 동시 요청
 * Map내 해당 유저 ID 존재 여부 확인 -> 기존 Mutex 잠금 여부 확인 -> 잠긴경우 대기 / 열린경우 잠금 활성 후 비즈니스 로직 실행 -> ''
 * -> 같은 유저일 경우 동일한 Mutex 인스턴스(같은 길)을 공유 하기때문에 순차적 처리 가능
 * -> 충전 / 사용과 같은 다른 메서드에서도 동일하게 적용되므로 순차적 처리 가능
 *
 * 2. 다른 유저 동시 요청
 * -> 다른 유저일 경우 신규 Mutex 인스턴스(새로운 길)을 이용하기 때문에 병렬 처리 가능
 *
 */

@Injectable()
export class PointService {
    constructor(
        private readonly userDb: UserPointTable,
        private readonly historyDb: PointHistoryTable,
    ) {}

    async chargePoint(userId: number, amount: number) {
        try {
            if (!amount || amount <= 0) {
                throw new BadRequestException('충전 금액을 확인해주세요.');
            }

            const userSelect = await this.userDb.selectById(userId);
            if (!userSelect) {
                throw new BadRequestException('유저 정보를 찾을 수 없습니다.');
            }

            const chargePoint = amount + userSelect.point;

            //TODO: 최대 보유값은 객체 멤버변수로 관리 할 것.
            if (chargePoint >= 10_000_000) {
                throw new BadRequestException('보유 금액을 초과했습니다.');
            }

            const rowData = await this.userDb.insertOrUpdate(userId, chargePoint);

            const { CHARGE: type } = TransactionType;

            await this.historyDb.insert(userId, amount, type, Date.now());

            return rowData;
        } catch (err) {
            throw err;
        }
    }

    async usePoint(userId: number, amount: number) {
        try {
            if (!amount || amount <= 0) {
                throw new BadRequestException('사용 금액을 확인해주세요.');
            }

            const user = await this.userDb.selectById(userId);
            if (!user) {
                throw new NotFoundException('유저 정보를 찾을 수 없습니다.');
            }

            if (amount > user.point) {
                throw new BadRequestException('보유 금액을 확인해주세요.');
            }

            const remainingPoint = user.point - amount;

            const rowData = await this.userDb.insertOrUpdate(userId, remainingPoint);

            const { USE: type } = TransactionType;

            await this.historyDb.insert(userId, amount, type, Date.now());

            return rowData;
        } catch (err) {
            throw err;
        }
    }

    async selectUserPoint(userId: number) {
        try {
            if (!userId || (Number.isInteger(userId) && userId < 0)) {
                throw new BadRequestException('유저 ID를 확인해주세요.');
            }

            const user = await this.userDb.selectById(userId);
            if (!user) {
                throw new NotFoundException('유저 정보를 찾을 수 없습니다.');
            }

            return user;
        } catch (err) {
            throw err;
        }
    }

    async selectUserPointHistory(userId: number) {
        try {
            if (!userId || (Number.isInteger(userId) && userId <= 0)) {
                throw new BadRequestException('유저 ID를 확인해주세요.');
            }

            const user = await this.userDb.selectById(userId);
            if (!user) {
                throw new NotFoundException('유저 정보를 찾을 수 없습니다.');
            }

            return await this.historyDb.selectAllByUserId(userId);
        } catch (err) {
            throw err;
        }
    }
}
