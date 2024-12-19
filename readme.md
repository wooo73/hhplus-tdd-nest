## 동시성 제어 방식 보고서

### 문제 상황

- **같은 사용자의 동시적인 포인트 충전/사용**
    - 동시 요청으로 인해 충전되는 포인트가 비정상적으로 동작.
- **서로 다른 사용자의 동시적인 포인트 충전/사용**
    - 같은 사용자의 잠금 처리 방식에 따라 다른 사용자에게까지 잠금 영향을 미칠 가능성 존재.

### 구현 방식

**문재 재현 코드**
동시에 같은 유저에 대해 포인트 충전 요청이 발생하는 경우, 비정상적인 결과가 나타납니다.

```typescript

//db
selectById(id: number): Promise<UserPoint> {
    this.isValidId(id);
    return new Promise((r) =>
        setTimeout(() => {
            r(this.table.get(id) ?? { id: id, point: 0, updateMillis: Date.now() });
        }, randomInt(200)),
    );
}

insertOrUpdate(id: number, amount: number): Promise<UserPoint> {
    this.isValidId(id);
    return new Promise((r) =>
        setTimeout(() => {
            console.log(`포인트 : ${amount}`);
            const userPoint = { id: id, point: amount, updateMillis: Date.now() };
            this.table.set(id, userPoint);
            r(userPoint);
        }, randomInt(300)),
    );
}


//service
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

        if (chargePoint >= this.LimitChargePoint) {
            throw new BadRequestException('보유 금액을 초과했습니다.');
        }

        const rowData = await this.userDb.insertOrUpdate(userId, chargePoint);

        return rowData;
    } catch (err) {
        throw err;
    }
}

//test
it('SUCCESS_같은 유저가 동시에 포인트 충전할 경우 순차적으로 처리 되는가?', async () => {
    const user = randomInt(range);

    await Promise.all([
        request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 100 }),
        request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 123 }),
        request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 544 }),
        request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 321 }),
        request(app.getHttpServer()).patch(`/point/${user}/charge`).send({ amount: 421 }),
    ]);

    const userPoint = await request(app.getHttpServer()).get(`/point/${user}`);
    expect(userPoint.body.point).toEqual(100 + 123 + 544 + 321 + 421); // FAIL
});
```

### 첫 번째 해결 방법

**뮤텍스 사용**
충전 실행 시 잠금을 걸어 다른 요청이 처리되기 전까지 대기 상태로 유지하였습니다.

```typescript
import { Mutex } from 'async-mutex';

const mutex = new Mutex();

try {
    const release = await mutex.acquire();
    // ~~charge point
    return response;
} catch (err) {
    throw err;
} finally {
    release();
}
```

**문제점**
위 방식은 충전 요청을 순차적으로 처리했지만, 다른 사용자 요청에 대해서도 동일한 잠금이 적용되었습니다.
즉, 특정 유저의 작업이 끝날 때까지 다른 유저의 요청도 대기하게 되어 성능 문제가 발생할 가능성이 큽니다.

### 개선된 구현 방식

**유저별 고유 잠금 처리**
각 유저별로 고유한 잠금을 생성하도록 Map 자료구조를 활용하였습니다.
이를 통해 잠금 범위를 유저 단위로 분리하여 독립적으로 작동하도록 구현하였습니다.

**구현코드**

```typescript
export class LockInterceptor implements NestInterceptor {
    private lock = new Map<number, Mutex>(); // 유저별 Mutex 저장
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const userId = request.params.id;

        if (userId) {
            request.lock = this.getLock(userId);
        }

        const release = await this.getLock(userId).acquire();

        return next.handle().pipe(
            finalize(() => {
                release(); // 항상 release가 실행되도록 보장
                this.deleteLock(userId); // 사용 후 잠금 정보 삭제
            }),
        );
    }

    //고유 잠금 생성
    private getLock(userId: number) {
        if (!this.lock.has(userId)) {
            this.lock.set(userId, new Mutex());
        }
        return this.lock.get(userId);
    }

    // 잠금 정보 삭제
    private deleteLock(userId: number) {
        this.lock.delete(userId);
    }
}
```

- [**LockInterceptor 구현**](https://github.com/wooo73/hhplus-tdd-nest/commit/cad8f88ba5f40dd70fece8de2932ab58ed70958c#diff-529b892b4e1d3181474a3e698c04145642610d724915b094bf948b02b52b97a5R1)
- [**E2E 테스트**](https://github.com/wooo73/hhplus-tdd-nest/commit/240e75f4c49c2680d73dcec1519a332ec430c7cf#diff-07ba1bf8da11808769647b7432dec5d598253fc945127dedb101c705f6343034L1)

---

### 구현 방식 요약

1. **잠금 획득 프로세스**
    - 요청 시 Interceptor가 userId에 기반한 고유 잠금 생성
    - 잠금을 획득한 요청만 비즈니스 로직 실행
    - 작업이 끝난 후 잠금을 해제하고, 잠금 정보 삭제
2. **순차 처리 보장**
    - 같은 유저에 대한 요청은 순차적으로 처리됨.
    - 다른 유저의 요청은 독립적으로 처리되어 성능 저하를 방지
