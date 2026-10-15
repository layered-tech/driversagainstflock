const uiFonts = {
    Regular: 'font-areaRegular',
    Medium: 'font-areaMedium',
    Semibold: 'font-areaSemibold',
    Bold: 'font-areaBold',
};

export function areaTextClassName(className = '') {
    const classes = className.split(/\s+/);
    const weight = classes.includes('font-bold')
        ? 'Bold'
        : classes.includes('font-semibold')
          ? 'Semibold'
          : classes.includes('font-medium')
            ? 'Medium'
            : 'Regular';
    const family = classes.includes('font-dafDisplay')
        ? 'font-areaDisplay'
        : classes.includes('font-dafMono')
          ? weight === 'Bold'
              ? 'font-areaMonoBold'
              : weight === 'Semibold'
                ? 'font-areaMonoSemibold'
                : 'font-areaMono'
          : uiFonts[weight];
    return [
        ...classes.filter(
            (name) =>
                !/^font-(dafDisplay|dafUi|dafMono|normal|medium|semibold|bold)$/.test(
                    name,
                ),
        ),
        family,
    ].join(' ');
}
