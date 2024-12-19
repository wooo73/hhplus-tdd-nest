import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { Mutex } from 'async-mutex';

@Injectable()
export class LockInterceptor implements NestInterceptor {
    private lock = new Map<number, Mutex>();
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
                this.deleteLock(userId);
            }),
        );
    }

    private getLock(userId: number) {
        if (!this.lock.has(userId)) {
            this.lock.set(userId, new Mutex());
        }
        return this.lock.get(userId);
    }

    private deleteLock(userId: number) {
        this.lock.delete(userId);
    }
}
