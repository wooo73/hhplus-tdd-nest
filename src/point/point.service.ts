import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PointHistoryTable } from '../database/pointhistory.table';
import { UserPointTable } from '../database/userpoint.table';
import { TransactionType } from '../point/point.model';

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
