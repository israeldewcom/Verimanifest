private generateTokens(userId: string, companyId: string, role: string) {
  const accessToken = jwt.sign(
    { userId, companyId, role },
    environment.JWT_SECRET,
    { expiresIn: environment.JWT_EXPIRY as any }
  );
  const refreshToken = jwt.sign(
    { userId, companyId, role },
    environment.JWT_REFRESH_SECRET,
    { expiresIn: environment.JWT_REFRESH_EXPIRY as any }
  );
  return { accessToken, refreshToken };
}
