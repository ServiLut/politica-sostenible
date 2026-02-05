// Forensic Utils

export function generateRenderHash(userId: string) {
    // Generate a unique hash based on user and timestamp (hourly rotation)
    const timeBlock = Math.floor(Date.now() / 3600000); 
    const str = `${userId}-${timeBlock}-SECRET_SALT`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).toUpperCase();
}

export function injectCanaryData(data: any[], userId: string) {
    // Inserts a hidden record that identifies the leaker
    const canary = {
        id: `CNRY-${generateRenderHash(userId)}`,
        name: 'Registro de Control', // Generic name
        details: 'Confidencial - Do not share',
        _isCanary: true,
        _leakerId: userId
    };
    
    // Insert at random position
    const pos = Math.floor(Math.random() * data.length);
    const newData = [...data];
    // We might need to match the structure of data, 
    // but for generic export logic, we append or specific field injection is better.
    // For now, we append a marked record if array.
    newData.splice(pos, 0, canary);
    return newData;
}
