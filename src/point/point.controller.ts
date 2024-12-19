import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    UseInterceptors,
    ValidationPipe,
} from '@nestjs/common';

import { LockInterceptor } from '../interceptor/lock.interceptor';

import { PointService } from './point.service';

import { PointHistory, UserPoint } from './point.model';

import { PointBody as PointDto } from './point.dto';

@Controller('/point')
export class PointController {
    constructor(private readonly pointService: PointService) {}

    /**
     * TODO - 특정 유저의 포인트를 조회하는 기능을 작성해주세요.
     * - 유저 id 검증 -> 정수외 값 실패
     * - 유저 조회 -> 유저 존재 여부 확인
     */
    @Get(':id')
    async point(@Param('id') id): Promise<UserPoint> {
        const userId = Number.parseInt(id);
        return await this.pointService.selectUserPoint(userId);
    }

    /**
     * TODO - 특정 유저의 포인트 충전/이용 내역을 조회하는 기능을 작성해주세요.
     * - 유저 id 검증 -> 정수외 값 실패
     * - 유저 조회 -> 유저 존재 여부 확인
     */
    @Get(':id/histories')
    async history(@Param('id') id): Promise<PointHistory[]> {
        const userId = Number.parseInt(id);
        return await this.pointService.selectUserPointHistory(userId);
    }

    /**
     * TODO - 특정 유저의 포인트를 충전하는 기능을 작성해주세요.
     * * 컨트롤러 실행시
     * - 충전 금액 검증 -> 충전 포인트가 0 이하 또는 숫자가 아닐 경우 && 충전 결과값 10_000_000 이상일 경우 실패
     * - 유저 조회 -> 존재하지 않는 유저일 경우 실패
     * - 유저 포인트 충전 -> 먼저 요청으로 넘어온 유저에 대해 응답 후 다음 로직 실행(순서 보장)
     *      - 이력 생성
     *      - 증가된 유저 포인트 응답
     */
    @UseInterceptors(LockInterceptor)
    @Patch(':id/charge')
    async charge(@Param('id') id, @Body(ValidationPipe) pointDto: PointDto): Promise<UserPoint> {
        const userId = Number.parseInt(id);
        const amount = pointDto.amount;
        return this.pointService.chargePoint(userId, amount);
    }

    /**
     * TODO - 특정 유저의 포인트를 사용하는 기능을 작성해주세요.
     *
     * - 사용할 포인트 검증 -> 사용 포인트 0 이하 또는 숫자가 아닐 경우 && 사용 포인트가 보유 포인트 초과시 실패
     * - 유저 조회 -> 존재하지 않는 유저일 경우 실패
     * - 유저 포인트 차감 -> 먼저 요청으로 넘어온 유저에 대해 응답 후 다음 로직 실행(순서 보장)
     *      - 이력 생성
     *      - 사용된 유저 포인트 응답
     */
    @UseInterceptors(LockInterceptor)
    @Patch(':id/use')
    async use(@Param('id') id, @Body(ValidationPipe) pointDto: PointDto): Promise<UserPoint> {
        const userId = Number.parseInt(id);
        const amount = pointDto.amount;
        return this.pointService.usePoint(userId, amount);
    }
}
