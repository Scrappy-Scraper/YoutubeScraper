export type TimeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
export declare function parseAgeText(ageString: string): {
    amount: number;
    unit: TimeUnit;
} | undefined;
