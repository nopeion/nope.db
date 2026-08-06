export class DatabaseError extends Error {
    constructor(message = 'Unknown Error') {
        super(message);
        this.name = 'DatabaseError';
    }
}
